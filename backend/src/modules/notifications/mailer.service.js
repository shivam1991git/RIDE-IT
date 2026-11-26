const nodemailer = require('nodemailer');
const { config } = require('../../config/env');

let transport = null;
const outbox = []; // Captured messages in tests / when SMTP is not configured.

function getTransport() {
    if (!config.smtp.host) return null;
    if (!transport) {
        transport = nodemailer.createTransport({
            host: config.smtp.host,
            port: config.smtp.port,
            secure: config.smtp.port === 465,
            auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
        });
    }
    return transport;
}

async function sendMail({ to, subject, text }) {
    const smtp = getTransport();
    if (!smtp) {
        outbox.push({ to, subject, text });
        if (!config.isTest && !config.isProduction) {
            console.log(`\n[mail:dev] To: ${to}\nSubject: ${subject}\n${text}\n`);
        }
        if (config.isProduction) {
            console.warn('SMTP is not configured; email was not sent.');
        }
        return false;
    }
    await smtp.sendMail({ from: config.smtp.from, to, subject, text });
    return true;
}

module.exports = { sendMail, outbox };
