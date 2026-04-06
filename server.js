const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

let cartasClash = [
    { name: 'Corredor', elixir: 4, rarity: 'Rara', type: 'Tropa' },
    { name: 'Megacavaleiro', elixir: 7, rarity: 'Lendária', type: 'Tropa' },
    { name: 'Tronco', elixir: 2, rarity: 'Lendária', type: 'Feitiço' },
    { name: 'P.E.K.K.A', elixir: 7, rarity: 'Épica', type: 'Tropa' }
];

let jogadores = [];
let votos = {};
let jogoEmAndamento = false;

async function carregarAPI() {
    try {
        const response = await fetch('https://royaleapi.github.io/cr-api-data/json/cards.json');
        if (response.ok) {
            const data = await response.json();
            let arrayAPI = Array.isArray(data) ? data : (data.items || data.cards || []);
            let cartasValidas = arrayAPI.filter(c => c.name);

            if (cartasValidas.length > 0) {
                cartasClash = cartasValidas.map(c => ({
                    name: c.name,
                    elixir: c.elixir || c.cost || "?",
                    rarity: c.rarity || "Desconhecida",
                    type: c.type || "Tropa"
                }));
                console.log(`✅ API carregada: ${cartasClash.length} cartas reais.`);
            }
        }
    } catch (e) {
        console.log("⚠️ Falha na API. Usando cartas offline.");
    }
}
carregarAPI();

io.on('connection', (socket) => {
    socket.emit('atualizarJogadores', jogadores);

    socket.on('entrarJogo', (nome) => {
        if (jogoEmAndamento) return socket.emit('erro', 'O jogo já começou!');
        if (jogadores.length >= 4) return socket.emit('erro', 'Sala cheia!');
        if (jogadores.find(j => j.id === socket.id)) return;

        jogadores.push({ id: socket.id, nome: nome });
        console.log(`User: ${nome} entrou. Total: ${jogadores.length}/4`);
        io.emit('atualizarJogadores', jogadores);

        if (jogadores.length === 4) {
            jogoEmAndamento = true;
            iniciarPartida(); // Direto, sem Timer!
        }
    });

    socket.on('pedirVotacao', () => io.emit('abrirTelaVotacao', jogadores));

    socket.on('enviarVoto', (idVotado) => {
        votos[socket.id] = idVotado;
        if (Object.keys(votos).length >= jogadores.length) apurarVotos();
    });

    socket.on('disconnect', () => {
        jogadores = jogadores.filter(j => j.id !== socket.id);
        console.log(`User: Alguém saiu. Restam: ${jogadores.length}/4`);
        if (jogadores.length === 0) {
            jogoEmAndamento = false;
            votos = {};
        }
        io.emit('atualizarJogadores', jogadores);
    });
});

function iniciarPartida() {
    try {
        // 🛡️ TRAVA ANTI-CRASH: Impede o erro da sua imagem!
        if (jogadores.length === 0) {
            console.log("⚠️ Partida abortada: A sala esvaziou de repente.");
            jogoEmAndamento = false;
            return;
        }

        const cartaSorteada = cartasClash[Math.floor(Math.random() * cartasClash.length)];
        const dicaGerada = `Custo: ${cartaSorteada.elixir} | Raridade: ${cartaSorteada.rarity} | Tipo: ${cartaSorteada.type}`;

        const ordemFalas = [...jogadores].sort(() => Math.random() - 0.5);
        const nomesOrdem = ordemFalas.map(j => j.nome);

        const indexImpostor = Math.floor(Math.random() * jogadores.length);
        const idImpostor = jogadores[indexImpostor].id;

        console.log(`Game: Sorteio concluído. Iniciando para ${jogadores.length} jogadores.`);

        jogadores.forEach((jog) => {
            const ehImpostor = (jog.id === idImpostor);
            io.to(jog.id).emit('jogoIniciado', {
                papel: ehImpostor ? { tipo: 'Impostor', dica: dicaGerada } : { tipo: 'Inocente', carta: cartaSorteada.name },
                ordemFalas: nomesOrdem
            });
        });
    } catch (err) {
        console.error("ERRO CRÍTICO no sorteio:", err);
        io.emit('erro', 'Falha no servidor. Atualize a página.');
        jogoEmAndamento = false;
    }
}

function apurarVotos() {
    io.emit('resultadoFinal', "Votação encerrada! Discutam o resultado.");
    jogadores = [];
    votos = {};
    jogoEmAndamento = false;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server Online: Porta ${PORT}`));