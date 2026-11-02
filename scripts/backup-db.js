// Backs up (or restores) the configured database as Extended JSON files.
//   npm run backup                                   -> writes ./backups/<db>-<timestamp>/
//   npm run backup -- --restore <folder> --confirm-restore
//       -> REPLACES every collection found in <folder> with its backed-up contents
// Backups contain personal data and password hashes: keep them private (gitignored).
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { EJSON } = require('bson');
const { config, assertConfig } = require('../src/config');

function arg(name) {
    const index = process.argv.indexOf(`--${name}`);
    return index > -1 ? process.argv[index + 1] : undefined;
}

async function backup(db) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.join(__dirname, '..', 'backups', `${db.databaseName}-${stamp}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const { name } of await db.listCollections().toArray()) {
        const docs = await db.collection(name).find().toArray();
        fs.writeFileSync(path.join(dir, `${name}.json`), EJSON.stringify(docs, null, 2, { relaxed: false }));
        console.log(`  ${name}: ${docs.length} documents`);
    }
    console.log(`\nBackup written to ${dir}`);
}

async function restore(db, dir) {
    if (!process.argv.includes('--confirm-restore')) {
        throw new Error('Restore replaces data. Re-run with --confirm-restore to proceed.');
    }
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
        const name = path.basename(file, '.json');
        const docs = EJSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'), { relaxed: false });
        await db.collection(name).deleteMany({});
        if (docs.length) await db.collection(name).insertMany(docs);
        console.log(`  restored ${name}: ${docs.length} documents`);
    }
    console.log('\nRestore complete. Indexes created by the migration remain; drop them in Atlas if rolling back fully.');
}

async function main() {
    assertConfig();
    const client = await MongoClient.connect(config.mongoUri, { serverSelectionTimeoutMS: 15000 });
    try {
        const db = client.db(config.mongoDbName);
        const from = arg('restore');
        console.log(`${from ? 'Restoring' : 'Backing up'} database "${db.databaseName}"\n`);
        if (from) await restore(db, path.resolve(from));
        else await backup(db);
    } finally {
        await client.close();
    }
}

main().catch(error => {
    console.error(error.message.replace(/mongodb(\+srv)?:\/\/[^@]+@/, 'mongodb$1://***@'));
    process.exitCode = 1;
});
