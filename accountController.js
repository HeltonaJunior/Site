// accountController.js
const crypto = require('crypto');
const { db, promiseDb } = require('./db');

function sha1(input) {
    return crypto.createHash('sha1').update(input).digest('hex');
}

function isPasswordStrong(password) {
    if (password.length < 8) return false;
    if (!/[A-Z]/.test(password)) return false;
    if (!/[a-z]/.test(password)) return false;
    if (!/[0-9]/.test(password)) return false;
    // Check for at least one special character if needed, otherwise this regex is fine.
    // If you strictly want at least one special character, uncomment the following line and remove the previous one.
    // if (!/[^a-zA-Z0-9]/.test(password)) return false;
    return true; // Password meets criteria
}

exports.login = async (req) => {
    const { loginIdentifier, password } = req.body;

    if (!loginIdentifier || !password) {
        return { success: false, message: 'Por favor, digite seu nome de conta/email e senha.' };
    }

    let connection;
    try {
        connection = await promiseDb.getConnection();

        const [rows] = await connection.query(
            'SELECT id, name, email, password, group_id FROM accounts WHERE name = ? OR email = ? LIMIT 1',
            [loginIdentifier, loginIdentifier]
        );

        if (!rows.length) {
            return { success: false, message: 'Credenciais inválidas.' };
        }

        const user = rows[0];
        let passwordMatches = false;
        if (user.password.length === 40) {
            // Antigo hash SHA1
            passwordMatches = user.password === sha1(password);
        } else {
            // Hash bcrypt
            passwordMatches = await require('bcrypt').compare(password, user.password);
        }

        if (!passwordMatches) {
            return { success: false, message: 'Credenciais inválidas.' };
        }

        return {
            success: true,
            message: 'Login bem-sucedido!',
            user: {
                id: user.id,
                name: user.name,
                group_id: user.group_id
            }
        };

    } catch (err) {
        console.error('[AccountController/Login] Erro:', err);
        return { success: false, message: 'Erro no servidor durante o login.' };
    } finally {
        if (connection) connection.release();
    }
};

exports.registerAccount = async (req, res) => {
    return res.status(501).json({ success: false, message: 'A rota de registro POST é tratada diretamente no server.js para multi-step.' });
};

exports.createCharacter = async (req, res) => {
    if (!req.session.user || !req.session.user.id) {
        return res.status(401).json({ success: false, message: 'Não autenticado!' });
    }
    const accountId = req.session.user.id;
    const { characterName, sex } = req.body; // No need to get background from here

    if (!characterName || !sex) {
        return res.status(400).json({ success: false, message: 'Nome e sexo são obrigatórios!' });
    }

    const cleanName = characterName.trim();
    if (cleanName.length < 3 || cleanName.length > 20 || !/^[a-zA-Z0-9 ]+$/.test(cleanName) || cleanName.includes('  ')) {
        return res.status(400).json({ success: false, message: 'Nome do personagem inválido.' });
    }

    const created = Math.floor(Date.now() / 1000);
    const defaultBackground = 1; // Default background for new characters
    const defaultLanguage = 'pt-BR';
    const defaultIsPrivate = 0; // Default to public profile

    let connection;
    try {
        connection = await promiseDb.getConnection();

        const [[{ count }]] = await connection.query(
            'SELECT COUNT(*) AS count FROM players WHERE account_id = ? AND deleted = 0',
            [accountId]
        );
        if (count >= 5) {
            return res.status(400).json({ success: false, message: 'Limite de personagens atingido.' });
        }

        const [existing] = await connection.query('SELECT id FROM players WHERE name = ? AND deleted = 0', [cleanName]);
        if (existing.length > 0) {
            return res.status(409).json({ success: false, message: 'Nome de personagem já está em uso.' });
        }

        await connection.query(
            `INSERT INTO players (
                name, account_id, sex, background, town_id, posx, posy, posz,
                level, vocation, health, healthmax, experience, deleted,
                conditions, created, language, isPrivate
            ) VALUES (?, ?, ?, ?, 1, 32368, 32236, 7, 1, 0, 150, 150, 0, 0, '', ?, ?, ?)`,
            [cleanName, accountId, sex, defaultBackground, created, defaultLanguage, defaultIsPrivate]
        );

        return res.json({ success: true, message: 'Personagem criado com sucesso!' });
    } catch (err) {
        console.error('[createCharacter] Erro:', err);
        return res.status(500).json({ success: false, message: 'Erro ao criar personagem.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.checkCharacterName = async (req, res) => {
    const { name } = req.query;
    if (!name) return res.status(400).json({ exists: false, message: 'Nome não fornecido.' });
    const cleanName = name.trim();

    let connection;
    try {
        connection = await promiseDb.getConnection();
        const [rows] = await connection.query(
            'SELECT id FROM players WHERE name = ? AND deleted = 0 LIMIT 1',
            [cleanName]
        );
        return res.json({ exists: rows.length > 0 });
    } catch (err) {
        console.error('[AccountController/CheckCharacter] Erro:', err);
        return res.status(500).json({ exists: false, message: 'Erro no servidor ao verificar nome.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.deleteCharacter = async (req, res) => {
    if (!req.session.user || !req.session.user.id) {
        return res.status(401).json({ success: false, message: 'Não autenticado!' });
    }
    const accountId = req.session.user.id;
    const { characterId, password } = req.body;

    if (!characterId || !password) {
        return res.status(400).json({ success: false, message: 'Campos obrigatórios não preenchidos (ID do personagem e senha).' });
    }

    let connection;
    try {
        connection = await promiseDb.getConnection();

        const [accountResults] = await connection.query(
            'SELECT password FROM accounts WHERE id = ?',
            [accountId]
        );
        if (accountResults.length === 0) {
            return res.status(404).json({ success: false, message: 'Conta não encontrada.' });
        }

        const hashedPassword = accountResults[0].password;
        const inputHash = sha1(password);
        if (hashedPassword !== inputHash) {
            return res.status(401).json({ success: false, message: 'Senha da conta incorreta.' });
        }

        const [characterResults] = await connection.query(
            'SELECT id FROM players WHERE id = ? AND account_id = ? AND deleted = 0 LIMIT 1',
            [characterId, accountId]
        );
        if (characterResults.length === 0) {
            return res.status(403).json({ success: false, message: 'Personagem não encontrado, já deletado, ou não pertence a esta conta.' });
        }

        // Instead of DELETE, consider a soft delete (setting `deleted` to 1)
        const [deleteResult] = await connection.query(
            'UPDATE players SET deleted = 1 WHERE id = ? AND account_id = ?',
            [characterId, accountId]
        );
        // If you still prefer hard delete, revert to:
        // 'DELETE FROM players WHERE id = ? AND account_id = ?',

        if (deleteResult.affectedRows === 0) {
            return res.status(500).json({ success: false, message: 'Erro ao excluir personagem.' });
        }

        return res.json({ success: true, message: 'Personagem excluído com sucesso!' });
    } catch (err) {
        console.error('[AccountController/DeleteCharacter] Erro:', err);
        return res.status(500).json({ success: false, message: 'Erro ao excluir personagem no servidor.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.sha1 = sha1;
exports.isPasswordStrong = isPasswordStrong;