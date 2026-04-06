const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

let cartasClash = [{ nome: 'Corredor', dica: 'Custa 4 de Elixir. Raridade: Rara. Tipo: Tropa.' }]; // Fallback
let jogadores = [];
let votos = {};
let jogoEmAndamento = false;
let indexImpostorGeral = -1;

// Busca as cartas uma única vez ao ligar o servidor
fetch('https://royaleapi.github.io/cr-api-data/json/cards.json')
    .then(res => res.json())
    .then(data => {
        cartasClash = data.map(c => ({
            nome: c.name,
            dica: `Custo: ${c.elixir} Elixir. Raridade: ${c.rarity}. Tipo: ${c.type}.`
        }));
        console.log(`✅ API carregada: ${cartasClash.length} cartas prontas!`);
    })
    .catch(err => console.error('❌ Falha na API. Usando carta padrão.'));

io.on('connection', (socket) => {
    // Sempre que alguém abre a página, recebe o status atual da sala
    socket.emit('atualizarJogadores', jogadores);

    socket.on('entrarJogo', (nome) => {
        if (jogoEmAndamento) {
            socket.emit('erro', 'Uma partida já está acontecendo. Aguarde terminar.');
            return;
        }
        if (jogadores.length >= 4) {
            socket.emit('erro', 'A sala já está cheia (4/4).');
            return;
        }
        // Evita duplicatas do mesmo jogador
        if (jogadores.some(j => j.id === socket.id)) return;

        jogadores.push({ id: socket.id, nome: nome });

        // Avisa TODOS (inclusive quem já estava na sala) que a contagem mudou
        io.emit('atualizarJogadores', jogadores);

        // Se bater 4, trava a sala e inicia
        if (jogadores.length === 4) {
            jogoEmAndamento = true;
            iniciarPartida();
        }
    });

    socket.on('pedirVotacao', () => {
        io.emit('abrirTelaVotacao', jogadores);
    });

    socket.on('enviarVoto', (idVotado) => {
        votos[socket.id] = idVotado;
        // Se o número de votos for igual ao de jogadores vivos, apura
        if (Object.keys(votos).length >= jogadores.length) {
            apurarVotos();
        }
    });

    socket.on('disconnect', () => {
        // Remove o jogador imediatamente
        jogadores = jogadores.filter(j => j.id !== socket.id);

        // Se a sala esvaziar, reseta o servidor por completo
        if (jogadores.length === 0) {
            jogoEmAndamento = false;
            votos = {};
        }

        io.emit('atualizarJogadores', jogadores);
    });
});

function iniciarPartida() {
    const cartaSorteada = cartasClash[Math.floor(Math.random() * cartasClash.length)];
    const ordemJogadores = [...jogadores].sort(() => Math.random() - 0.5);
    const ordemNomes = ordemJogadores.map(j => j.nome);
    indexImpostorGeral = Math.floor(Math.random() * 4);
    votos = {};

    // Manda a carta específica de cada um
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

    const impostorReal = jogadores[indexImpostorGeral] || { id: 'saiu', nome: 'Desconhecido' };
    const jogadorExpulso = jogadores.find(j => j.id === maisVotadoId) || { nome: 'Ninguém' };
    let empatou = Object.values(contagem).filter(v => v === maxVotos).length > 1;

    let mensagemFinal = "";
    if (empatou) {
        mensagemFinal = `⚖️ EMPATE! Ninguém foi expulso. O Impostor (${impostorReal.nome}) venceu!`;
    } else if (maisVotadoId === impostorReal.id) {
        mensagemFinal = `🎉 VITÓRIA! Vocês expulsaram o Impostor: ${impostorReal.nome}!`;
    } else {
        mensagemFinal = `💀 ERROU! Vocês expulsaram o inocente ${jogadorExpulso.nome}. O Impostor era: ${impostorReal.nome}!`;
    }

    // Libera a sala para a próxima partida
    jogoEmAndamento = false;
    jogadores = [];
    votos = {};

    io.emit('resultadoFinal', mensagemFinal);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor online na porta ${PORT}`);
});