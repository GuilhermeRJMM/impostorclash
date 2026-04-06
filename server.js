const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let cartasClash = [];
let jogadores = [];

// Função para buscar as cartas da RoyaleAPI automaticamente
async function carregarCartas() {
    try {
        const response = await fetch('https://royaleapi.github.io/cr-api-data/json/cards.json');
        const data = await response.json();

        // Transforma os dados da API no formato do nosso jogo
        cartasClash = data.map(carta => ({
            nome: carta.name,
            // Gera uma dica automática usando os dados reais da carta
            dica: `Custa ${carta.elixir} de Elixir. Raridade: ${carta.rarity}. Tipo: ${carta.type}.`
        }));

        console.log(`✅ ${cartasClash.length} cartas carregadas da API com sucesso!`);
    } catch (erro) {
        console.error('❌ Erro ao buscar cartas:', erro);
        // Fallback caso a internet caia
        cartasClash = [{ nome: 'Corredor', dica: 'Custa 4 de Elixir. Raridade: Rara. Tipo: Tropa.' }];
    }
}

// Carrega as cartas assim que o servidor liga
carregarCartas();

io.on('connection', (socket) => {
    socket.on('entrarJogo', (nome) => {
        if (jogadores.length >= 4) {
            socket.emit('erro', 'A sala já está cheia (4/4).');
            return;
        }

        jogadores.push({ id: socket.id, nome: nome });
        io.emit('atualizarJogadores', jogadores);

        if (jogadores.length === 4) {
            iniciarPartida();
        }
    });

    socket.on('disconnect', () => {
        jogadores = jogadores.filter(j => j.id !== socket.id);
        io.emit('atualizarJogadores', jogadores);
    });
});

function iniciarPartida() {
    const cartaSorteada = cartasClash[Math.floor(Math.random() * cartasClash.length)];
    const ordemJogadores = jogadores.sort(() => Math.random() - 0.5);
    const ordemNomes = ordemJogadores.map(j => j.nome);
    const indexImpostor = Math.floor(Math.random() * 4);

    ordemJogadores.forEach((jogador, index) => {
        const ehImpostor = (index === indexImpostor);
        let papel = ehImpostor
            ? { tipo: 'Impostor', dica: cartaSorteada.dica }
            : { tipo: 'Inocente', carta: cartaSorteada.nome };

        io.to(jogador.id).emit('jogoIniciado', { papel, ordemFalas: ordemNomes });
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});