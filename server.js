const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

// Lista de reserva caso a API falhe ou demore
let cartasClash = [
    { name: 'Corredor', elixir: 4, rarity: 'Rara', type: 'Tropa' },
    { name: 'Megacavaleiro', elixir: 7, rarity: 'Lendária', type: 'Tropa' },
    { name: 'Tronco', elixir: 2, rarity: 'Lendária', type: 'Feitiço' },
    { name: 'P.E.K.K.A', elixir: 7, rarity: 'Épica', type: 'Tropa' }
];

let jogadores = [];
let votos = {};
let jogoEmAndamento = false;

// Busca cartas da API
async function carregarAPI() {
    try {
        console.log("System: Tentando carregar RoyaleAPI...");
        const response = await fetch('https://royaleapi.github.io/cr-api-data/json/cards.json');
        if (response.ok) {
            const data = await response.json();
            cartasClash = data;
            console.log(`System: ${data.length} cartas carregadas com sucesso.`);
        }
    } catch (e) {
        console.log("System: Falha ao carregar API, usando cartas de reserva.");
    }
}
carregarAPI();

io.on('connection', (socket) => {
    console.log(`User: Novo socket conectado: ${socket.id}`);

    // Envia o estado atual para quem acabou de conectar
    socket.emit('atualizarJogadores', jogadores);

    socket.on('entrarJogo', (nome) => {
        try {
            if (jogoEmAndamento) return socket.emit('erro', 'Jogo em andamento!');
            if (jogadores.length >= 4) return socket.emit('erro', 'Sala cheia!');
            if (jogadores.find(j => j.id === socket.id)) return;

            jogadores.push({ id: socket.id, nome: nome });
            console.log(`User: ${nome} entrou. Total: ${jogadores.length}/4`);
            io.emit('atualizarJogadores', jogadores);

            if (jogadores.length === 4) {
                jogoEmAndamento = true;
                // Pequeno delay para garantir que o 4º jogador recebeu o status antes de mudar a tela
                setTimeout(iniciarPartida, 1000);
            }
        } catch (err) {
            console.error("CRITICAL ERROR no entrarJogo:", err);
        }
    });

    socket.on('pedirVotacao', () => io.emit('abrirTelaVotacao', jogadores));

    socket.on('enviarVoto', (idVotado) => {
        votos[socket.id] = idVotado;
        if (Object.keys(votos).length >= jogadores.length) apurarVotos();
    });

    socket.on('disconnect', () => {
        jogadores = jogadores.filter(j => j.id !== socket.id);
        if (jogadores.length === 0) {
            jogoEmAndamento = false;
            votos = {};
        }
        io.emit('atualizarJogadores', jogadores);
        console.log(`User: Alguém saiu. Restam: ${jogadores.length}`);
    });
});

function iniciarPartida() {
    try {
        console.log("Game: Iniciando partida...");

        // Sorteio Seguro
        const cartaSorteada = cartasClash[Math.floor(Math.random() * cartasClash.length)];
        const dicaGerada = `Custo: ${cartaSorteada.elixir} | Raridade: ${cartaSorteada.rarity} | Tipo: ${cartaSorteada.type}`;

        // Embaralha ordem de fala
        const ordemFalas = [...jogadores].sort(() => Math.random() - 0.5);
        const nomesOrdem = ordemFalas.map(j => j.nome);

        // Sorteia Impostor baseado no tamanho atual da lista
        const indexImpostor = Math.floor(Math.random() * jogadores.length);
        const idImpostor = jogadores[indexImpostor].id;

        console.log(`Game: Carta da rodada: ${cartaSorteada.name}. Impostor ID: ${idImpostor}`);

        jogadores.forEach((jog) => {
            const ehImpostor = (jog.id === idImpostor);
            io.to(jog.id).emit('jogoIniciado', {
                papel: ehImpostor ? { tipo: 'Impostor', dica: dicaGerada } : { tipo: 'Inocente', carta: cartaSorteada.name },
                ordemFalas: nomesOrdem
            });
        });
    } catch (err) {
        console.error("CRITICAL ERROR no iniciarPartida:", err);
        io.emit('erro', 'Erro ao iniciar partida. Reiniciando...');
        jogoEmAndamento = false;
        jogadores = [];
        io.emit('atualizarJogadores', []);
    }
}

function apurarVotos() {
    try {
        let contagem = {};
        for (let id in votos) {
            let v = votos[id];
            contagem[v] = (contagem[v] || 0) + 1;
        }

        // Lógica simplificada de resultado
        io.emit('resultadoFinal', "Votação encerrada! Verifique quem foi o mais votado com o grupo.");

        // Reseta tudo para a próxima
        jogadores = [];
        votos = {};
        jogoEmAndamento = false;
    } catch (e) {
        console.error("Erro na apuração:", e);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server: Online na porta ${PORT}`));