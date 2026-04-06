const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Aqui é onde ele procura a pasta public. Ela precisa existir!
app.use(express.static('public'));

let cartasClash = [];
let jogadores = [];
let indexImpostorGeral = -1;
let votos = {}; // Armazena quem votou em quem

// Busca as cartas da RoyaleAPI
async function carregarCartas() {
    try {
        const response = await fetch('https://royaleapi.github.io/cr-api-data/json/cards.json');
        const data = await response.json();

        cartasClash = data.map(carta => ({
            nome: carta.name,
            dica: `Custa ${carta.elixir} de Elixir. Raridade: ${carta.rarity}. Tipo: ${carta.type}.`
        }));
        console.log(`✅ ${cartasClash.length} cartas carregadas!`);
    } catch (erro) {
        console.error('❌ Erro na API:', erro);
        cartasClash = [{ nome: 'Corredor', dica: 'Custa 4 de Elixir. Raridade: Rara.' }];
    }
}
carregarCartas();

io.on('connection', (socket) => {

    // Jogador entra na sala
    socket.on('entrarJogo', (nome) => {
        if (jogadores.length >= 4) {
            socket.emit('erro', 'A sala já está cheia (4/4).');
            return;
        }
        jogadores.push({ id: socket.id, nome: nome });
        io.emit('atualizarJogadores', jogadores);

        if (jogadores.length === 4) iniciarPartida();
    });

    // Iniciar a Votação
    socket.on('pedirVotacao', () => {
        io.emit('abrirTelaVotacao', jogadores);
    });

    // Receber um voto
    socket.on('enviarVoto', (idVotado) => {
        votos[socket.id] = idVotado;

        // Se todos os 4 votaram, apura o resultado
        if (Object.keys(votos).length === 4) {
            apurarVotos();
        }
    });

    // Desconexão
    socket.on('disconnect', () => {
        jogadores = jogadores.filter(j => j.id !== socket.id);
        io.emit('atualizarJogadores', jogadores);
        votos = {}; // Reseta votos se alguém cair
    });
});

function iniciarPartida() {
    const cartaSorteada = cartasClash[Math.floor(Math.random() * cartasClash.length)];
    const ordemJogadores = jogadores.sort(() => Math.random() - 0.5);
    const ordemNomes = ordemJogadores.map(j => j.nome);
    indexImpostorGeral = Math.floor(Math.random() * 4);
    votos = {}; // Reseta os votos para a nova partida

    ordemJogadores.forEach((jogador, index) => {
        const ehImpostor = (index === indexImpostorGeral);
        let papel = ehImpostor
            ? { tipo: 'Impostor', dica: cartaSorteada.dica }
            : { tipo: 'Inocente', carta: cartaSorteada.nome };

        io.to(jogador.id).emit('jogoIniciado', { papel, ordemFalas: ordemNomes });
    });
}

function apurarVotos() {
    let contagem = {};
    let maisVotadoId = null;
    let maxVotos = 0;

    // Conta os votos
    for (let eleitor in votos) {
        let escolhido = votos[eleitor];
        contagem[escolhido] = (contagem[escolhido] || 0) + 1;

        if (contagem[escolhido] > maxVotos) {
            maxVotos = contagem[escolhido];
            maisVotadoId = escolhido;
        }
    }

    const impostorReal = jogadores[indexImpostorGeral];
    const jogadorExpulso = jogadores.find(j => j.id === maisVotadoId);

    // Verifica se empatou (mais de um com o mesmo número máximo de votos)
    let empatou = Object.values(contagem).filter(v => v === maxVotos).length > 1;

    let mensagemFinal = "";
    if (empatou) {
        mensagemFinal = `⚖️ Deu empate na votação! O Impostor (${impostorReal.nome}) escapou ileso!`;
    } else if (maisVotadoId === impostorReal.id) {
        mensagemFinal = `🎉 VITÓRIA DOS INOCENTES! Vocês descobriram o Impostor: ${impostorReal.nome}!`;
    } else {
        mensagemFinal = `💀 VITÓRIA DO IMPOSTOR! Vocês expulsaram um inocente (${jogadorExpulso.nome}). O verdadeiro impostor era: ${impostorReal.nome}!`;
    }

    io.emit('resultadoFinal', mensagemFinal);

    // Limpa a sala para a próxima partida
    jogadores = [];
    votos = {};
    io.emit('reiniciarInterface');
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});