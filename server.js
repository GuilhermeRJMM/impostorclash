const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
// Adicionando CORS para garantir que ninguém seja bloqueado pela rede
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

let cartasClash = [];
let jogadores = [];
let indexImpostorGeral = -1;
let votos = {};

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

    socket.on('entrarJogo', (nome) => {
        // Evita que o mesmo cara entre duas vezes se bugar o clique
        if (jogadores.find(j => j.id === socket.id)) return;

        if (jogadores.length >= 4) {
            socket.emit('erro', 'A sala já está cheia (4/4).');
            return;
        }
        jogadores.push({ id: socket.id, nome: nome });
        io.emit('atualizarJogadores', jogadores);

        if (jogadores.length === 4) iniciarPartida();
    });

    socket.on('pedirVotacao', () => {
        io.emit('abrirTelaVotacao', jogadores);
    });

    socket.on('enviarVoto', (idVotado) => {
        votos[socket.id] = idVotado;

        // Se a quantidade de votos for igual ao número de jogadores vivos
        if (Object.keys(votos).length >= jogadores.length) {
            apurarVotos();
        }
    });

    socket.on('disconnect', () => {
        // Remove o jogador que saiu e avisa os outros
        jogadores = jogadores.filter(j => j.id !== socket.id);
        io.emit('atualizarJogadores', jogadores);

        // Se o jogo esvaziar, limpa os votos para não travar a próxima sala
        if (jogadores.length === 0) {
            votos = {};
        }
    });
});

function iniciarPartida() {
    // Garantia caso as cartas ainda não tenham carregado
    if (cartasClash.length === 0) {
        cartasClash = [{ nome: 'Corredor', dica: 'Custa 4 de Elixir. Raridade: Rara.' }];
    }

    const cartaSorteada = cartasClash[Math.floor(Math.random() * cartasClash.length)];
    const ordemJogadores = jogadores.sort(() => Math.random() - 0.5);
    const ordemNomes = ordemJogadores.map(j => j.nome);
    indexImpostorGeral = Math.floor(Math.random() * 4);
    votos = {};

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

    for (let eleitor in votos) {
        let escolhido = votos[eleitor];
        contagem[escolhido] = (contagem[escolhido] || 0) + 1;

        if (contagem[escolhido] > maxVotos) {
            maxVotos = contagem[escolhido];
            maisVotadoId = escolhido;
        }
    }

    // Trava de segurança: se o impostor desconectou antes de acabar
    const impostorReal = jogadores[indexImpostorGeral] || { id: 'saiu', nome: 'Jogador Desconectado' };
    const jogadorExpulso = jogadores.find(j => j.id === maisVotadoId) || { nome: 'Ninguém' };

    let empatou = Object.values(contagem).filter(v => v === maxVotos).length > 1;

    let mensagemFinal = "";
    if (empatou) {
        mensagemFinal = `⚖️ Deu empate! O Impostor (${impostorReal.nome}) escapou ileso!`;
    } else if (maisVotadoId === impostorReal.id) {
        mensagemFinal = `🎉 VITÓRIA! Vocês descobriram o Impostor: ${impostorReal.nome}!`;
    } else {
        mensagemFinal = `💀 O IMPOSTOR VENCEU! Vocês expulsaram ${jogadorExpulso.nome}. O verdadeiro impostor era: ${impostorReal.nome}!`;
    }

    io.emit('resultadoFinal', mensagemFinal);

    jogadores = [];
    votos = {};
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});