const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs').promises;

const { db, promiseDb } = require('./db');
const accountController = require('./accountController');
const recoverController = require('./recoverController');
const avatarRoutes = require('./routes/avatar');
const newsController = require('./newsController');

const app = express();
const port = 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
    secret: 'uma_string_secreta_muito_forte_e_aleatoria_12345',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.errorMessage = req.session.errorMessage;
    res.locals.successMessage = req.session.successMessage;
    delete req.session.errorMessage;
    delete req.session.successMessage;
    next();
});

function requireLogin(req, res, next) {
    if (req.session && req.session.user) {
        next();
    } else {
        req.session.errorMessage = 'Você precisa estar logado para acessar esta página.';
        res.redirect('/login');
    }
}

function redirectIfLoggedIn(req, res, next) {
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    }
    next();
}

app.get('/', async (req, res) => {
    let connection;
    try {
        connection = await promiseDb.getConnection();
        const queryConditions = 'WHERE deleted = 0 AND group_id < 2';
        const [totalPlayersResult] = await connection.execute(`SELECT COUNT(*) as total FROM players ${queryConditions}`);
        const totalPlayers = totalPlayersResult[0].total;
        const [highestLevelResult] = await connection.execute(`SELECT MAX(level) as maxLevel FROM players ${queryConditions}`);
        const highestLevel = highestLevelResult[0].maxLevel || 0;
        const [topPlayers] = await connection.execute(`
            SELECT name, level FROM players 
            ${queryConditions} 
            ORDER BY level DESC, experience DESC 
            LIMIT 5
        `);
        res.render('index', {
            title: 'Home',
            serverStats: { totalPlayers, highestLevel, topPlayers }
        });
    } catch (error) {
        console.error("Erro ao buscar dados para a página inicial:", error);
        res.render('index', {
            title: 'Home',
            serverStats: { totalPlayers: 0, highestLevel: 0, topPlayers: [] },
            error: "Não foi possível carregar os dados do servidor."
        });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/download', (req, res) => {
    res.render('download', { title: 'Download' });
});

app.get('/mapa', (req, res) => {
    res.render('mapa', { title: 'Mapa do Mundo' });
});

const countryNameToCodeMap = { 'Afeganistão': 'AF', 'África do Sul': 'ZA', 'Albânia': 'AL', 'Alemanha': 'DE', 'Andorra': 'AD', 'Angola': 'AO', 'Anguilla': 'AI', 'Antártida': 'AQ', 'Antígua e Barbuda': 'AG', 'Arábia Saudita': 'SA', 'Argélia': 'DZ', 'Argentina': 'AR', 'Armênia': 'AM', 'Aruba': 'AW', 'Austrália': 'AU', 'Áustria': 'AT', 'Azerbaijão': 'AZ', 'Bahamas': 'BS', 'Bahrein': 'BH', 'Bangladesh': 'BD', 'Barbados': 'BB', 'Belarus': 'BY', 'Bélgica': 'BE', 'Belize': 'BZ', 'Benin': 'BJ', 'Bermudas': 'BM', 'Bolívia': 'BO', 'Bósnia e Herzegovina': 'BA', 'Botsuana': 'BW', 'Brasil': 'BR', 'Brunei': 'BN', 'Bulgária': 'BG', 'Burkina Faso': 'BF', 'Burundi': 'BI', 'Butão': 'BT', 'Cabo Verde': 'CV', 'Camboja': 'KH', 'Canadá': 'CA', 'Catar': 'QA', 'Cazaquistão': 'KZ', 'República Centro-Africana': 'CF', 'Chade': 'TD', 'Chile': 'CL', 'China': 'CN', 'Chipre': 'CY', 'Colômbia': 'CO', 'Comores': 'KM', 'República do Congo': 'CG', 'República Democrática do Congo': 'CD', 'Coreia do Norte': 'KP', 'Coreia do Sul': 'KR', 'Costa do Marfim': 'CI', 'Costa Rica': 'CR', 'Croácia': 'HR', 'Cuba': 'CU', 'Dinamarca': 'DK', 'Djibouti': 'DJ', 'Dominica': 'DM', 'Egito': 'EG', 'El Salvador': 'SV', 'Emirados Árabes Unidos': 'AE', 'Equador': 'EC', 'Eritreia': 'ER', 'Eslováquia': 'SK', 'Eslovênia': 'SI', 'Espanha': 'ES', 'Estados Unidos': 'US', 'Estônia': 'EE', 'Etiópia': 'ET', 'Fiji': 'FJ', 'Filipinas': 'PH', 'Finlândia': 'FI', 'França': 'FR', 'Gabão': 'GA', 'Gâmbia': 'GM', 'Gana': 'GH', 'Geórgia': 'GE', 'Gibraltar': 'GI', 'Granada': 'GD', 'Grécia': 'GR', 'Groenlândia': 'GL', 'Guadalupe': 'GP', 'Guam': 'GU', 'Guatemala': 'GT', 'Guiana': 'GY', 'Guiana Francesa': 'GF', 'Guiné': 'GN', 'Guiné-Bissau': 'GW', 'Guiné Equatorial': 'GQ', 'Haiti': 'HT', 'Honduras': 'HN', 'Hong Kong': 'HK', 'Hungria': 'HU', 'Iêmen': 'YE', 'Ilha Bouvet': 'BV', 'Ilha Christmas': 'CX', 'Ilha Norfolk': 'NF', 'Ilhas Aland': 'AX', 'Ilhas Cayman': 'KY', 'Ilhas Cocos (Keeling)': 'CC', 'Ilhas Cook': 'CK', 'Ilhas Feroe': 'FO', 'Ilhas Malvinas': 'FK', 'Ilhas Marianas do Norte': 'MP', 'Ilhas Marshall': 'MH', 'Ilhas Pitcairn': 'PN', 'Ilhas Salomão': 'SB', 'Ilhas Turks e Caicos': 'TC', 'Ilhas Menores Distantes dos Estados Unidos': 'UM', 'Ilhas Virgens Britânicas': 'VG', 'Ilhas Virgens Americanas': 'VI', 'Ilhas Heard e McDonald': 'HM', 'Irlanda': 'IE', 'Irã': 'IR', 'Iraque': 'IQ', 'Islândia': 'IS', 'Israel': 'IL', 'Itália': 'IT', 'Jamaica': 'JM', 'Japão': 'JP', 'Jordânia': 'JO', 'Kuwait': 'KW', 'Laos': 'LA', 'Lesoto': 'LS', 'Letônia': 'LV', 'Líbano': 'LB', 'Libéria': 'LR', 'Líbia': 'LY', 'Liechtenstein': 'LI', 'Lituânia': 'LT', 'Luxemburgo': 'LU', 'Macau': 'MO', 'Macedônia do Norte': 'MK', 'Madagascar': 'MG', 'Malásia': 'MY', 'Malawi': 'MW', 'Maldivas': 'MV', 'Mali': 'ML', 'Malta': 'MT', 'Martinica': 'MQ', 'Mauritânia': 'MR', 'Maurício': 'MU', 'Mayotte': 'YT', 'México': 'MX', 'Micronésia': 'FM', 'Moçambique': 'MZ', 'Moldávia': 'MD', 'Mônaco': 'MC', 'Mongólia': 'MN', 'Montenegro': 'ME', 'Montserrat': 'MS', 'Marrocos': 'MA', 'Mianmar': 'MM', 'Namíbia': 'NA', 'Nauru': 'NR', 'Nepal': 'NP', 'Países Baixos': 'NL', 'Antilhas Holandesas': 'AN', 'Nova Caledônia': 'NC', 'Nova Zelândia': 'NZ', 'Nicarágua': 'NI', 'Níger': 'NE', 'Nigéria': 'NG', 'Niue': 'NU', 'Noruega': 'NO', 'Omã': 'OM', 'Palau': 'PW', 'Panamá': 'PA', 'Papua Nova Guiné': 'PG', 'Paquistão': 'PK', 'Paraguai': 'PY', 'Peru': 'PE', 'Polinésia Francesa': 'PF', 'Polônia': 'PL', 'Porto Rico': 'PR', 'Portugal': 'PT', 'Quênia': 'KE', 'Quirguistão': 'KG', 'Kiribati': 'KI', 'Reino Unido': 'GB', 'República Tcheca': 'CZ', 'República Dominicana': 'DO', 'Reunião': 'RE', 'Romênia': 'RO', 'Ruanda': 'RW', 'Rússia': 'RU', 'Saara Ocidental': 'EH', 'Saint Pierre e Miquelon': 'PM', 'Samoa': 'WS', 'Samoa Americana': 'AS', 'San Marino': 'SM', 'Santa Helena': 'SH', 'Santa Lúcia': 'LC', 'São Cristóvão e Nevis': 'KN', 'São Martinho (Parte Francesa)': 'MF', 'São Martinho (Parte Holandesa)': 'SX', 'São Tomé e Príncipe': 'ST', 'São Vicente e Granadinas': 'VC', 'Senegal': 'SN', 'Serra Leoa': 'SL', 'Sérvia': 'RS', 'Singapura': 'SG', 'Síria': 'SY', 'Somália': 'SO', 'Sri Lanka': 'LK', 'Eswatini': 'SZ', 'Sudão': 'SD', 'Sudão do Sul': 'SS', 'Suécia': 'SE', 'Suíça': 'CH', 'Suriname': 'SR', 'Svalbard e Jan Mayen': 'SJ', 'Tajiquistão': 'TJ', 'Tailândia': 'TH', 'Taiwan': 'TW', 'Tanzânia': 'TZ', 'Terras Austrais Francesas': 'TF', 'Território Britânico do Oceano Índico': 'IO', 'Timor-Leste': 'TL', 'Togo': 'TG', 'Tokelau': 'TK', 'Tonga': 'TO', 'Trinidad e Tobago': 'TT', 'Tunísia': 'TN', 'Turcomenistão': 'TM', 'Turquia': 'TR', 'Tuvalu': 'TV', 'Ucrânia': 'UA', 'Uganda': 'UG', 'Uruguai': 'UY', 'Uzbequistão': 'UZ', 'Vanuatu': 'VU', 'Cidade do Vaticano': 'VA', 'Venezuela': 'VE', 'Vietnã': 'VN', 'Wallis e Futuna': 'WF', 'Zâmbia': 'ZM', 'Zimbábue': 'ZW' };

function getFlagCodeForServer(countryName) {
    return countryNameToCodeMap[countryName] || 'BR';
}

app.get('/ranking', async (req, res) => {
    const availablePageSizes = [5, 10, 20, 50, 100];
    let pageSize = parseInt(req.query.pageSize, 10) || availablePageSizes[0];
    if (!availablePageSizes.includes(pageSize)) {
        pageSize = availablePageSizes[0];
    }
    const currentPage = parseInt(req.query.page, 10) || 1;
    const offset = (currentPage - 1) * pageSize;
    const search = req.query.search ? req.query.search.trim() : '';
    const rankingType = req.query.type || 'level';
    let connection;
    try {
        connection = await promiseDb.getConnection();
        let queryWhere = 'WHERE p.deleted = 0 AND p.group_id < 2';
        const selectParams = [];
        const countParams = [];
        if (search) {
            queryWhere += ' AND p.name LIKE ?';
            const searchQueryValue = `%${search}%`;
            selectParams.push(searchQueryValue);
            countParams.push(searchQueryValue);
        }
        let queryOrder = 'ORDER BY p.level DESC, p.experience DESC';
        if (rankingType === 'resets') {
            queryOrder = 'ORDER BY p.resets DESC, p.level DESC, p.experience DESC';
        }
        const countSql = `SELECT COUNT(*) AS total FROM players p ${queryWhere}`;
        const [countResult] = await connection.execute(countSql, countParams);
        const totalPlayersCount = countResult[0].total;
        const selectSql = `
            SELECT
                p.id, p.account_id, p.name, p.level, p.vocation, p.experience,
                p.resets, p.deleted, p.group_id, p.looktype, p.lookhead, p.lookbody,
                p.looklegs, p.lookfeet, p.sex, p.background, p.isPrivate, a.location
            FROM players p
            JOIN accounts a ON p.account_id = a.id
            ${queryWhere}
            ${queryOrder}
            LIMIT ? OFFSET ?`;
        selectParams.push(pageSize, offset);
        const [players] = await connection.execute(selectSql, selectParams);
        const processedPlayers = players.map(player => ({
            ...player,
            flagCode: getFlagCodeForServer(player.location)
        }));
        const totalPages = Math.ceil(totalPlayersCount / pageSize);
        const responseData = { players: processedPlayers, currentPage, totalPages, pageSize, search, rankingType };
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            res.json(responseData);
        } else {
            res.render('ranking', { ...responseData, title: `Ranking de ${rankingType === 'level' ? 'Nível' : 'Resets'}`, availablePageSizes, user: req.session.user });
        }
    } catch (error) {
        console.error('Erro ao buscar ranking:', error);
        if (!req.xhr) {
            req.session.errorMessage = 'Erro ao carregar o ranking.';
            res.redirect('/');
        } else {
            res.status(500).json({ message: 'Erro ao carregar dados do ranking.' });
        }
    } finally {
        if (connection) connection.release();
    }
});

app.get('/character/:name', async (req, res) => {
    const charName = req.params.name;
    let connection;
    try {
        connection = await promiseDb.getConnection();

        // Query principal do jogador, agora com mais campos
        const playerQuery = `
            SELECT 
                p.id, p.name, p.level, p.experience, p.isPrivate, p.account_id,
                p.background, p.online, p.mural_message,
                p.created, -- Data de criação do personagem (players.created)
                p.lastlogin, -- Último login do personagem (players.lastlogin)
                p.onlinetimetoday, -- Tempo online hoje (players.onlinetimetoday)
                p.onlinetimeall, -- Tempo online total (players.onlinetimeall)
                a.location -- Nacionalidade (accounts.location)
            FROM players p
            JOIN accounts a ON p.account_id = a.id
            WHERE p.name = ? AND p.deleted = 0 AND p.group_id < 2`;
        const [playerRows] = await connection.execute(playerQuery, [charName]);

        if (playerRows.length === 0) {
            return res.status(404).render('404', { title: 'Jogador Não Encontrado', message: `Jogador "${charName}" não encontrado.` });
        }

        const player = playerRows[0];
        const isOwner = req.session.user && req.session.user.id === player.account_id;

        if (player.isPrivate === 1 && !isOwner) {
            return res.render('character', {
                title: 'Perfil Privado',
                player: { name: player.name }, // Passa apenas o nome para a página privada
                isPrivate: true,
                isOwner: false,
                user: req.session.user
            });
        }
        
        // --- BUSCA DE DADOS ADICIONAIS ---

        // 1. Posição no Ranking
        // Esta query calcula a posição baseada no level e experiência (e group_id/deleted)
        const rankQuery = `
            SELECT COUNT(*) + 1 AS rank 
            FROM players 
            WHERE (level > ? OR (level = ? AND experience > ?))
            AND deleted = 0 AND group_id < 2`;
        const [rankRows] = await connection.execute(rankQuery, [player.level, player.level, player.experience]);
        player.rank = rankRows[0].rank;
        player.flagCode = getFlagCodeForServer(player.location); // Adiciona o código da bandeira

        // 2. Estatísticas Gerais (Exemplo: buscando de uma tabela 'player_stats')
        // Substitua esta query pela sua lógica real
        /*
        const [statsRows] = await connection.execute(
            'SELECT total_captures, total_deaths, battles_won, online_time_seconds FROM player_stats WHERE player_id = ?', 
            [player.id]
        );
        const playerStats = statsRows.length > 0 ? statsRows[0] : { total_captures: 0, total_deaths: 0, battles_won: 0, online_time_seconds: 0 };
        */
        // Dados de exemplo para fins de demonstração:
        const playerStats = {
            total_captures: 123,
            total_deaths: 45,
            battles_won: 340,
            online_time_seconds: 273600 // (3 dias, 4 horas)
        };
        
        // 3. Insígnias (Exemplo: buscando de 'player_badges')
        /*
        const [badgeRows] = await connection.execute(
            'SELECT name, date_achieved, leader_name FROM player_badges WHERE player_id = ?', 
            [player.id]
        );
        const playerBadges = badgeRows;
        */
        // Dados de exemplo para fins de demonstração:
        const playerBadges = [
            { name: 'Rocha', date_achieved: '2023-01-15', leader_name: 'Brock' },
            { name: 'Cascata', date_achieved: '2023-02-20', leader_name: 'Misty' },
            { name: 'Trovão', date_achieved: '2023-03-10', leader_name: 'Lt. Surge' }
        ];

        // 4. Últimas Mortes (Exemplo: buscando de 'player_deaths')
        /*
        const [deathRows] = await connection.execute(
            'SELECT `time`, `level`, killed_by, killer_sprite, killer_type FROM player_deaths WHERE player_id = ? ORDER BY `time` DESC LIMIT 5', // Assumindo killer_type existe
            [player.id]
        );
        const lastDeaths = deathRows.map(d => ({ ...d, time: new Date(d.time * 1000) }));
        */
        // Dados de exemplo para fins de demonstração (com killer_type adicionado):
        const lastDeaths = [
            { time: new Date(), level: 150, killed_by: 'um Dragonite', killer_sprite: '149.gif', killer_type: 'pokemon selvagem' },
            { time: new Date(Date.now() - 86400000), level: 148, killed_by: 'um Gengar', killer_sprite: '094.gif', killer_type: 'pokemon selvagem' },
            { time: new Date(Date.now() - 172800000), level: 140, killed_by: 'Outro Treinador', killer_sprite: '068.gif', killer_type: 'jogador' } // Exemplo de morte por jogador
        ];

        // 5. Pokémons Derrotados (Exemplo: de 'player_kills')
        /*
        const [defeatedRows] = await connection.execute(
            'SELECT pokemon_name, count, sprite_name, type FROM player_pokemon_kills WHERE player_id = ? ORDER BY count DESC', // Assumindo 'type' existe
            [player.id]
        );
        const defeatedPokemons = defeatedRows;
        */
       // Dados de exemplo para fins de demonstração (com 'type' adicionado):
       const defeatedPokemons = [
            { pokemon_name: 'Pikachu', count: 120, sprite_name: '025.gif', type: 'electric' },
            { pokemon_name: 'Snorlax', count: 95, sprite_name: '143.gif', type: 'normal' },
            { pokemon_name: 'Gengar', count: 80, sprite_name: '094.gif', type: 'ghost' },
            { pokemon_name: 'Charizard', count: 50, sprite_name: '006.gif', type: 'fire' }
       ];
        
        // 6. Pokémons Capturados (Exemplo: de 'player_captures')
        /*
        const [capturedRows] = await connection.execute(
            'SELECT pokemon_name, rarity, type, sprite_name, capture_date FROM player_captures WHERE player_id = ? ORDER BY capture_date DESC', // Assumindo capture_date
            [player.id]
        );
        const capturedPokemons = capturedRows;
        */
       // Dados de exemplo para fins de demonstração (com capture_date adicionada):
       const capturedPokemons = [
            { pokemon_name: 'Mewtwo', rarity: 'Lendário', type: 'shiny', sprite_name: '150.gif', capture_date: new Date() },
            { pokemon_name: 'Bulbasaur', rarity: 'Comum', type: 'grass', sprite_name: '001.gif', capture_date: new Date(Date.now() - 50000000) }
       ];


        res.render('character', {
            title: player.name,
            player, // Agora contém created, lastlogin, onlinetimetoday, onlinetimeall
            playerStats,
            playerBadges,
            lastDeaths,
            defeatedPokemons,
            capturedPokemons,
            isPrivate: false,
            isOwner, // Passa se o visitante é o dono do perfil
            user: req.session.user
        });

    } catch (error) {
        console.error('Erro ao buscar jogador:', error);
        res.status(500).render('error', { title: 'Erro no Servidor', message: 'Ocorreu um erro ao buscar informações do jogador.' });
    } finally {
        if (connection) connection.release();
    }
});


// Adicione esta nova rota para editar o mural (Ponto 4)
app.put('/api/characters/:charId/mural', requireLogin, async (req, res) => {
    const { charId } = req.params;
    const { muralMessage } = req.body;
    const accountId = req.session.user.id;

    if (muralMessage === undefined || muralMessage.length > 140) {
        return res.status(400).json({ success: false, message: 'Mensagem inválida ou excede 140 caracteres.' });
    }

    let connection;
    try {
        connection = await promiseDb.getConnection();
        
        // Verifica se o personagem pertence ao usuário logado
        const [characterCheck] = await connection.execute(
            'SELECT account_id FROM players WHERE id = ? AND deleted = 0', 
            [charId]
        );

        if (characterCheck.length === 0 || characterCheck[0].account_id !== accountId) {
            return res.status(403).json({ success: false, message: 'Não autorizado.' });
        }

        await connection.execute('UPDATE players SET mural_message = ? WHERE id = ?', [muralMessage, charId]);
        
        res.json({ success: true, message: 'Mural atualizado com sucesso!' });
    } catch (error) {
        console.error('Erro ao atualizar mural:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao atualizar o mural.' });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/register', redirectIfLoggedIn, (req, res) => {
    const formData = req.session.formDataStep1;
    delete req.session.formDataStep1;
    res.render('register_step1', {
        title: 'Criar Conta - Etapa 1',
        formData: formData
    });
});

app.get('/register/step2', redirectIfLoggedIn, (req, res) => {
    if (!req.session.registrationData) {
        req.session.errorMessage = 'Por favor, complete a Etapa 1 primeiro.';
        return res.redirect('/register');
    }
    const formData = req.session.formDataStep2;
    delete req.session.formDataStep2;
    res.render('register_step2', {
        title: 'Criar Conta - Etapa 2',
        formData: formData
    });
});

app.post('/register', redirectIfLoggedIn, async (req, res) => {
    const { step, name, email, password, confirm_password, country } = req.body;
    let connection;
    try {
        connection = await promiseDb.getConnection();
        if (step === '1') {
            req.session.formDataStep1 = { name, email };
            if (!name || !email) {
                req.session.errorMessage = 'Por favor, preencha todos os campos.';
                return res.redirect('/register');
            }
            if (!/\S+@\S+\.\S+/.test(email)) {
                req.session.errorMessage = 'Por favor, insira um email válido.';
                return res.redirect('/register');
            }
            const [existingUsers] = await connection.execute('SELECT id, name, email FROM accounts WHERE name = ? OR email = ?', [name, email]);
            if (existingUsers.length > 0) {
                const nameExists = existingUsers.some(user => user.name === name);
                const emailExists = existingUsers.some(user => user.email === email);
                if (nameExists && emailExists) req.session.errorMessage = 'Nome de conta e Email já cadastrados.';
                else if (nameExists) req.session.errorMessage = 'Nome de conta já cadastrado.';
                else if (emailExists) req.session.errorMessage = 'Email já cadastrado.';
                return res.redirect('/register');
            }
            req.session.registrationData = { name, email };
            delete req.session.formDataStep1;
            return res.redirect('/register/step2');
        } else if (step === '2') {
            const registrationData = req.session.registrationData;
            if (!registrationData) {
                req.session.errorMessage = 'Sessão expirada ou Etapa 1 incompleta. Por favor, comece novamente.';
                return res.redirect('/register');
            }
            req.session.formDataStep2 = { country };
            if (!password || !confirm_password || !country) {
                req.session.errorMessage = 'Por favor, preencha todos os campos.';
                return res.redirect('/register/step2');
            }
            if (password !== confirm_password) {
                req.session.errorMessage = 'As senhas não coincidem.';
                return res.redirect('/register/step2');
            }
            if (!accountController.isPasswordStrong(password)) {
                req.session.errorMessage = 'A senha não atende aos requisitos de segurança (Mínimo 8 caracteres, com maiúscula, minúscula, número e caractere especial).';
                return res.redirect('/register/step2');
            }
            const { name, email } = registrationData;
            const hashedPassword = accountController.sha1(password);
            const generatedKey = crypto.randomBytes(64).toString('hex');
            const creationTimestamp = Math.floor(Date.now() / 1000);
            const defaultValues = { change_pass: 0, salt: '', premdays: 0, lastday: 0, blocked: 0, warnings: 0, group_id: 1, type: 1, accept_news: 0, event_points: 0, language: 0, vip_time: 0, lang_id: 0, shop_points: 0, userInfoProcessed: 0, rcoins: 0 };
            await connection.execute(`INSERT INTO accounts (name, email, password, \`key\`, location, created, change_pass, salt, premdays, lastday, blocked, warnings, group_id, type, accept_news, event_points, language, vip_time, lang_id, shop_points, userInfoProcessed, rcoins) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [name, email, hashedPassword, generatedKey, country, creationTimestamp, defaultValues.change_pass, defaultValues.salt, defaultValues.premdays, defaultValues.lastday, defaultValues.blocked, defaultValues.warnings, defaultValues.group_id, defaultValues.type, defaultValues.accept_news, defaultValues.event_points, defaultValues.language, defaultValues.vip_time, defaultValues.lang_id, defaultValues.shop_points, defaultValues.userInfoProcessed, defaultValues.rcoins]);
            delete req.session.registrationData;
            delete req.session.formDataStep2;
            req.session.successMessage = 'Conta criada com sucesso! Faça login para continuar.';
            return res.redirect('/login');
        } else {
            req.session.errorMessage = 'Etapa de registro inválida.';
            return res.redirect('/register');
        }
    } catch (error) {
        console.error('Erro durante o registro:', error);
        if (step === '2' && req.session.registrationData) {
            req.session.errorMessage = 'Erro ao finalizar o registro. Tente novamente mais tarde.';
            return res.redirect('/register/step2');
        } else {
            req.session.errorMessage = 'Erro ao processar a Etapa 1. Tente novamente mais tarde.';
            return res.redirect('/register');
        }
    } finally {
        if (connection) connection.release();
    }
});

app.get('/login', redirectIfLoggedIn, (req, res) => {
    res.render('login', { title: 'Login' });
});

app.post('/login', redirectIfLoggedIn, async (req, res) => {
    const result = await accountController.login(req);
    if (result.success) {
        req.session.user = { id: result.user.id, name: result.user.name, group_id: result.user.group_id };
        req.session.successMessage = `Bem-vindo de volta, ${result.user.name}!`;
        return res.redirect('/dashboard');
    } else {
        req.session.errorMessage = result.message;
        return res.redirect('/login');
    }
});

app.get('/recuperar', redirectIfLoggedIn, (req, res) => {
    res.render('recover/request', { title: 'Recuperar Senha' });
});

app.post('/recuperar', redirectIfLoggedIn, async (req, res) => {
    const { email } = req.body;
    if (!email) {
        req.session.errorMessage = 'Informe um email válido.';
        return res.redirect('/recuperar');
    }
    let connection;
    try {
        connection = await promiseDb.getConnection();
        const [rows] = await connection.query('SELECT id FROM accounts WHERE email = ? LIMIT 1', [email]);
        if (!rows.length) {
            req.session.errorMessage = 'Email não encontrado.';
            return res.redirect('/recuperar');
        }
        await recoverController.sendCode(email);
        req.session.resetEmail = email;
        req.session.successMessage = 'Código enviado para seu email.';
        return res.redirect('/verificar');
    } catch (err) {
        console.error('Erro ao enviar código:', err);
        req.session.errorMessage = 'Erro ao enviar código.';
        return res.redirect('/recuperar');
    } finally {
        if (connection) connection.release();
    }
});

app.get('/verificar', redirectIfLoggedIn, (req, res) => {
    if (!req.session.resetEmail) return res.redirect('/recuperar');
    res.render('recover/verify', { title: 'Verificar Código' });
});

app.post('/verificar', redirectIfLoggedIn, (req, res) => {
    const email = req.session.resetEmail;
    if (!email) return res.redirect('/recuperar');
    const code = [req.body.c1, req.body.c2, req.body.c3, req.body.c4, req.body.c5, req.body.c6].join('');
    if (recoverController.verifyCode(email, code)) {
        req.session.verified = true;
        return res.redirect('/resetar');
    } else {
        req.session.errorMessage = 'Código inválido ou expirado.';
        return res.redirect('/verificar');
    }
});

app.get('/resetar', redirectIfLoggedIn, (req, res) => {
    if (!req.session.verified) return res.redirect('/recuperar');
    res.render('recover/reset', { title: 'Redefinir Senha' });
});

app.post('/resetar', redirectIfLoggedIn, async (req, res) => {
    if (!req.session.verified || !req.session.resetEmail) return res.redirect('/recuperar');
    const { password, confirm_password } = req.body;
    if (!password || password !== confirm_password) {
        req.session.errorMessage = 'Senhas não coincidem.';
        return res.redirect('/resetar');
    }
    if (!accountController.isPasswordStrong(password)) {
        req.session.errorMessage = 'A senha não atende aos requisitos.';
        return res.redirect('/resetar');
    }
    try {
        await recoverController.updatePassword(req.session.resetEmail, password);
        req.session.successMessage = 'Senha atualizada com sucesso!';
        delete req.session.resetEmail;
        delete req.session.verified;
        return res.redirect('/login');
    } catch (err) {
        console.error('Erro ao atualizar senha:', err);
        req.session.errorMessage = 'Erro ao atualizar senha.';
        return res.redirect('/resetar');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Erro ao destruir a sessão:', err);
            req.session.errorMessage = 'Erro ao fazer logout. Tente novamente.';
            return res.redirect('/dashboard');
        }
        return res.redirect('/login');
    });
});

app.get('/dashboard', requireLogin, async (req, res) => {
    const accountId = req.session.user.id;
    let connection;
    try {
        connection = await promiseDb.getConnection();
        const [accountRows] = await connection.query('SELECT id, name, premdays, shop_points, group_id, rcoins FROM accounts WHERE id = ?', [accountId]);
        if (accountRows.length === 0) {
            req.session.destroy();
            req.session.errorMessage = 'Sua conta não foi encontrada.';
            return res.redirect('/login');
        }
        const account = accountRows[0];
        account.vip = account.premdays;
        account.rcoins = account.shop_points;
        const [characterRows] = await connection.query('SELECT id, name, sex, level, online, created, resets, looktype, lookhead, lookbody, looklegs, lookfeet, background, isPrivate FROM players WHERE account_id = ? AND deleted = 0', [accountId]);
        const characters = characterRows;
        const maxPlayersPerAccount = 5;
        const canCreateCharacter = characters.length < maxPlayersPerAccount;
        let backgroundFiles = [];
        const news = await newsController.getAllNews();
        const backgroundsDirPath = path.join(__dirname, 'public', 'assets', 'images', 'characters', 'backgrounds');
        try {
            const files = await fs.readdir(backgroundsDirPath);
            backgroundFiles = files.filter(file => file.startsWith('background_') && file.endsWith('.png')).map(file => parseInt(file.replace('background_', '').replace('.png', ''), 10)).filter(num => !isNaN(num)).sort((a, b) => a - b);
        } catch (readDirError) {
            console.error('Erro ao ler o diretório de backgrounds:', readDirError);
        }
        res.render('dashboard', { title: 'Dashboard', account, characters, canCreateCharacter, maxPlayersPerAccount, user: req.session.user, backgroundFiles, news });
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
        req.session.errorMessage = 'Erro ao carregar informações do dashboard. Por favor, tente novamente mais tarde.';
        return res.redirect('/');
    } finally {
        if (connection) connection.release();
    }
});

app.put('/api/characters/:charId', requireLogin, async (req, res) => {
    const charId = req.params.charId;
    const accountId = req.session.user.id;
    const { background, isPrivate } = req.body;
    let connection;
    try {
        connection = await promiseDb.getConnection();
        const [characterCheck] = await connection.execute('SELECT account_id FROM players WHERE id = ? AND deleted = 0', [charId]);
        if (characterCheck.length === 0 || characterCheck[0].account_id !== accountId) {
            return res.status(403).json({ success: false, message: 'Não autorizado ou personagem não encontrado.' });
        }
        if (background !== undefined) {
            await connection.execute('UPDATE players SET background = ? WHERE id = ?', [background, charId]);
            return res.json({ success: true, message: 'Background atualizado com sucesso!' });
        } else if (isPrivate !== undefined) {
            const privateStatus = isPrivate ? 1 : 0;
            await connection.execute('UPDATE players SET isPrivate = ? WHERE id = ?', [privateStatus, charId]);
            return res.json({ success: true, message: `Privacidade do perfil ${isPrivate ? 'ativada' : 'desativada'}!` });
        } else {
            return res.status(400).json({ success: false, message: 'Nenhum campo para atualizar fornecido.' });
        }
    } catch (error) {
        console.error('Erro ao atualizar personagem:', error);
        return res.status(500).json({ success: false, message: 'Erro interno ao atualizar personagem.' });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/characters/create', requireLogin, accountController.createCharacter);
app.get('/api/characters/checkname', accountController.checkCharacterName);
app.post('/api/characters/delete', requireLogin, accountController.deleteCharacter);

app.get('/news', async (req, res) => {
    try {
        const news = await newsController.getAllNews();
        res.render('news/list', { title: 'Notícias', news, user: req.session.user });
    } catch (err) {
        console.error('Erro ao carregar notícias:', err);
        res.render('news/list', { title: 'Notícias', news: [], user: req.session.user, errorMessage: 'Erro ao carregar notícias.' });
    }
});

app.get('/news/:id', async (req, res) => {
    try {
        const newsItem = await newsController.getNewsById(req.params.id);
        if (!newsItem) return res.status(404).render('404', { title: 'Notícia Não Encontrada' });
        res.render('news/view', { title: newsItem.title, news: newsItem, user: req.session.user });
    } catch (err) {
        console.error('Erro ao carregar notícia:', err);
        res.status(500).render('error', { title: 'Erro', message: 'Erro ao carregar notícia.' });
    }
});

app.get('/admin/news', requireLogin, async (req, res) => {
    if (req.session.user.group_id < 2) return res.redirect('/dashboard');
    try {
        const news = await newsController.getAllNews();
        res.render('news/admin_list', { title: 'Gerenciar Notícias', news, user: req.session.user });
    } catch (err) {
        console.error('Erro ao listar notícias:', err);
        res.render('news/admin_list', { title: 'Gerenciar Notícias', news: [], user: req.session.user, errorMessage: 'Erro ao listar notícias.' });
    }
});

app.get('/admin/news/new', requireLogin, (req, res) => {
    if (req.session.user.group_id < 2) return res.redirect('/dashboard');
    res.render('news/create', { title: 'Nova Notícia', user: req.session.user });
});

app.post('/admin/news/new', requireLogin, async (req, res) => {
    if (req.session.user.group_id < 2) return res.redirect('/dashboard');
    const { title, content, keywords } = req.body;
    try {
        await newsController.createNews({ title, content, keywords, author_id: req.session.user.id });
        res.redirect('/admin/news');
    } catch (err) {
        console.error('Erro ao criar notícia:', err);
        res.render('news/create', { title: 'Nova Notícia', user: req.session.user, errorMessage: 'Erro ao criar notícia.' });
    }
});

app.get('/admin/news/:id/edit', requireLogin, async (req, res) => {
    if (req.session.user.group_id < 2) return res.redirect('/dashboard');
    try {
        const newsItem = await newsController.getNewsById(req.params.id);
        if (!newsItem) return res.redirect('/admin/news');
        res.render('news/edit', { title: 'Editar Notícia', news: newsItem, user: req.session.user });
    } catch (err) {
        console.error('Erro ao carregar notícia para edição:', err);
        res.redirect('/admin/news');
    }
});

app.post('/admin/news/:id/edit', requireLogin, async (req, res) => {
    if (req.session.user.group_id < 2) return res.redirect('/dashboard');
    const { title, content, keywords } = req.body;
    try {
        await newsController.updateNews(req.params.id, { title, content, keywords });
        res.redirect(`/news/${req.params.id}`);
    } catch (err) {
        console.error('Erro ao atualizar notícia:', err);
        res.render('news/edit', { title: 'Editar Notícia', news: { id: req.params.id, title, content, keywords }, user: req.session.user, errorMessage: 'Erro ao atualizar notícia.' });
    }
});

app.use('/', avatarRoutes);

app.use((req, res) => {
    res.status(404).render('404', { title: 'Página Não Encontrada' });
});

app.use((err, req, res, next) => {
    console.error('Global Error Handler:', err.stack);
    res.status(500).render('error', { title: 'Erro no Servidor', message: 'Ocorreu um erro inesperado. Por favor, tente novamente mais tarde.' });
});

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});