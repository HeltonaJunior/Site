const crypto = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const { promiseDb } = require('./db');

const codes = new Map(); // email -> { code, expires }

// create transporter using ethereal for demo purposes
let transporterPromise = nodemailer.createTestAccount().then(testAccount => {
    return nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
            user: testAccount.user,
            pass: testAccount.pass
        }
    });
});

async function sendCode(email) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes
    codes.set(email, { code, expires });

    const transporter = await transporterPromise;
    const info = await transporter.sendMail({
        from: 'no-reply@example.com',
        to: email,
        subject: 'Código de recuperação',
        text: `Seu código de recuperação é: ${code}`
    });
    return nodemailer.getTestMessageUrl(info);
}

function verifyCode(email, code) {
    const entry = codes.get(email);
    if (!entry) return false;
    if (Date.now() > entry.expires) {
        codes.delete(email);
        return false;
    }
    const valid = entry.code === code;
    if (valid) codes.delete(email);
    return valid;
}

async function updatePassword(email, password) {
    const hash = await bcrypt.hash(password, 10);
    await promiseDb.query('UPDATE accounts SET password = ? WHERE email = ?', [hash, email]);
}

module.exports = { sendCode, verifyCode, updatePassword };
