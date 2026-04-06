const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

// 🛡️ BOTE SALVA-VIDAS: Se a internet piscar ou a API mudar de novo, o jogo usa essas!
let cartasClash = [
    { name: 'Corredor', elixir: 4, rarity: 'Rara', type: 'Tropa' },
    { name: 'Megacavaleiro', elixir: 7, rarity: 'Lendária', type: 'Tropa' },
    { name: 'Tronco', elixir: 2, rarity: 'Lendária', type: 'Feitiço' },
    { name: 'P.E.K.K.A', elixir: 7, rarity: 'Épica', type: 'Tropa' },
    { name: 'Princesa', elixir: 3, rarity: 'Lendária', type: 'Tropa' },
    { name: 'Barril de Goblins', elixir: 3, rarity: 'Épica', type: 'Feitiço' },
    { name: 'Mosqueteira', elixir: 4, rarity: 'Rara', type: 'Tropa' },
    { name: 'Golem', elixir: 8, rarity: 'Épica', type: 'Tropa' }
];

let jogadores = [];
let votos = {};
let jogoEmAndamento = false;

// Busca Inteligente
async function carregarAPI() {
    try {
        const response = await fetch('https://royaleapi.github.io/cr-api-data/json/cards.json');
        if (response.ok) {
            const data = await response.json();

            // Corrige o erro antigo: caça o array de cartas em qualquer lugar do JSON
            let arrayAPI = Array.isArray(data) ? data : (data.items || data.cards || []);
            let cartasValidas = arrayAPI.filter(c => c.name);

            if (cartasValidas.length > 0) {
                cartasClash = cartasValidas.map(c => ({
                    name: c.name,
                    elixir: c.elixir || c.cost || "?",
                    rarity: c.rarity || "Desconhecida",
                    type: c.type || "Tropa"
                }));
                console.log(`✅ API 100% carregada: ${cartasClash.length} cartas reais disponíveis.`);
            }
        }
    } catch (e) {
        console.log("⚠️ Demora na API. Usando bote salva-vidas (offline).");
    }
}
carregarAPI();

io.on('connection', (socket) => {
    socket.emit('atualizarJogadores', jogadores);

    socket.on('entrarJogo', (nome) => {
        if (jogoEmAndamento) return socket.emit('erro', 'O jogo já começou! Espere a rodada.');
        if (jogadores.length >= 4) return socket.emit('erro', 'A sala já está cheia!');
        if (jogadores.find(j => j.id === socket.id)) return;

        jogadores.push({ id: socket.id, nome: nome });
        io.emit('atualizarJogadores', jogadores);

        if (jogadores.length === 4) {
            jogoEmAndamento = true;
            iniciarPartida(); // Removi o "setTimeout" que engasgava o servidor
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
    });
});

function iniciarPartida() {
    try {
        const cartaSorteada = cartasClash[Math.floor(Math.random() * cartasClash.length)];
        const dicaGerada = `Custo: ${cartaSorteada.elixir} | Raridade: ${cartaSorteada.rarity} | Tipo: ${cartaSorteada.type}`;

        const ordemFalas = [...jogadores].sort(() => Math.random() - 0.5);
        const nomesOrdem = ordemFalas.map(j => j.nome);

        const indexImpostor = Math.floor(Math.random() * jogadores.length);
        const idImpostor = jogadores[indexImpostor].id;

        jogadores.forEach((jog) => {
            const ehImpostor = (jog.id === idImpostor);
            io.to(jog.id).emit('jogoIniciado', {
                papel: ehImpostor ? { tipo: 'Impostor', dica: dicaGerada } : { tipo: 'Inocente', carta: cartaSorteada.name },
                ordemFalas: nomesOrdem
            });
        });
    } catch (err) {
        console.error("ERRO:", err);
        io.emit('erro', 'Pequena falha ao sortear. Clique no botão de novo!');
        jogoEmAndamento = false;
    }
}

function apurarVotos() {
    io.emit('resultadoFinal', "A votação acabou! Discutam o resultado pelo Discord/Call.");
    jogadores = [];
    votos = {};
    jogoEmAndamento = false;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server Online: Porta ${PORT}`));