const fs = require('fs');
const { createClient } = require('@libsql/client');

async function seed() {
    const client = createClient({ url: 'file:local.db' });
    const schema = fs.readFileSync('schema.sql', 'utf8');
    
    const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);
    
    for (let stmt of statements) {
        try {
            await client.execute(stmt);
        } catch (e) {
            console.error('Error executing query:', stmt);
            console.error(e.message);
        }
    }
    console.log("Seeding complete -> local.db");
    client.close();
}

seed();
