const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialisation de la base SQLite
const dbFile = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
    if (!err) {
        console.log('Connecté à la base de données SQLite.');
        initDb();
    }
});

function initDb() {
    db.run(`CREATE TABLE IF NOT EXISTS eleves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL,
        niveau TEXT NOT NULL,
        type_cours TEXT NOT NULL,
        tarif_mensuel REAL NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS paiements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        eleve_id INTEGER,
        mois TEXT NOT NULL,
        montant_paye REAL NOT NULL,
        date_paiement TEXT NOT NULL,
        FOREIGN KEY(eleve_id) REFERENCES eleves(id)
    )`);
}

// Initialisation de WhatsApp avec le Chromium installé dans le Dockerfile
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// Génération d'un lien web cliquable propre pour le QR Code
client.on('qr', (qr) => {
    console.log('\n================================================================');
    console.log('CLIQUEZ SUR CE LIEN POUR OUVRIR LE QR CODE EN GRAND ET LE SCANNER :');
    console.log(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
    console.log('================================================================\n');
});

client.on('ready', () => {
    console.log('✅ Bot WhatsApp connecté et actif 24h/24 !');
});

client.on('message', async message => {
    const texte = message.body.trim().toLowerCase();
    const parts = message.body.trim().split(' ');

    // Commande 1 : "ajoute Youssef 2BAC 300"
    if (texte.startsWith('ajoute') || texte.startsWith('+')) {
        const nom = parts[1];
        const niveau = parts[2] ? parts[2].toUpperCase() : '2BAC';
        const tarif = parts[3] ? parseFloat(parts[3]) : 300;

        if (!nom) {
            message.reply("❌ Précisez le nom. Exemple : `ajoute Youssef 2BAC 300`");
            return;
        }

        db.run(`INSERT INTO eleves (nom, niveau, type_cours, tarif_mensuel) VALUES (?, ?, 'Groupe', ?)`,
            [nom, niveau, tarif], function(err) {
                if (err) message.reply("Erreur lors de l'enregistrement.");
                else message.reply(`✅ Élève *${nom}* (${niveau}) ajouté avec un tarif de *${tarif} DH*.`);
            });
    }

    // Commande 2 : "paye Youssef"
    else if (texte.includes('paye') || texte.includes('payé')) {
        const mots = message.body.trim().split(' ');
        const nomRecherche = mots.find(m => !['paye', 'payé', 'a', 'le'].includes(m.toLowerCase()));

        if (!nomRecherche) {
            message.reply("❌ Précisez le nom. Exemple : `paye Youssef`");
            return;
        }

        const moisActuel = new Date().toISOString().slice(0, 7);

        db.get(`SELECT * FROM eleves WHERE nom LIKE ?`, [`%${nomRecherche}%`], (err, eleve) => {
            if (!eleve) {
                message.reply(`❌ Aucun élève trouvé pour "${nomRecherche}".`);
                return;
            }

            db.get(`SELECT id FROM paiements WHERE eleve_id = ? AND mois = ?`, [eleve.id, moisActuel], (err, row) => {
                if (row) {
                    message.reply(`ℹ️ *${eleve.nom}* a déjà payé pour ce mois (${moisActuel}).`);
                } else {
                    db.run(`INSERT INTO paiements (eleve_id, mois, montant_paye, date_paiement) VALUES (?, ?, ?, ?)`,
                        [eleve.id, moisActuel, eleve.tarif_mensuel, new Date().toISOString().split('T')[0]], () => {
                            message.reply(`💰 Paiement validé pour *${eleve.nom}* : *${eleve.tarif_mensuel} DH*.`);
                        });
                }
            });
        });
    }
});

client.initialize();

// Routes Web (API)
app.get('/api/eleves', (req, res) => {
    const moisActuel = req.query.mois || new Date().toISOString().slice(0, 7);
    const query = `
        SELECT e.*, p.id as paiement_id, p.montant_paye, p.date_paiement 
        FROM eleves e
        LEFT JOIN paiements p ON e.id = p.eleve_id AND p.mois = ?
        ORDER BY e.niveau, e.nom
    `;
    db.all(query, [moisActuel], (err, rows) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json(rows);
    });
});

app.post('/api/eleves', (req, res) => {
    const { nom, niveau, type_cours, tarif_mensuel } = req.body;
    db.run(`INSERT INTO eleves (nom, niveau, type_cours, tarif_mensuel) VALUES (?, ?, ?, ?)`, 
    [nom, niveau, type_cours, tarif_mensuel], function(err) {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ id: this.lastID });
    });
});

app.delete('/api/eleves/:id', (req, res) => {
    db.run(`DELETE FROM paiements WHERE eleve_id = ?`, [req.params.id], () => {
        db.run(`DELETE FROM eleves WHERE id = ?`, [req.params.id], () => {
            res.json({ message: "Élève supprimé" });
        });
    });
});

app.post('/api/paiements', (req, res) => {
    const { eleve_id, mois, montant_paye } = req.body;
    const date_paiement = new Date().toISOString().split('T')[0];

    db.get(`SELECT id FROM paiements WHERE eleve_id = ? AND mois = ?`, [eleve_id, mois], (err, row) => {
        if (row) {
            db.run(`UPDATE paiements SET montant_paye = ?, date_paiement = ? WHERE id = ?`,
                [montant_paye, date_paiement, row.id], () => res.json({ message: "Mis à jour" }));
        } else {
            db.run(`INSERT INTO paiements (eleve_id, mois, montant_paye, date_paiement) VALUES (?, ?, ?, ?)`,
                [eleve_id, mois, montant_paye, date_paiement], () => res.json({ message: "Enregistré" }));
        }
    });
});

app.listen(PORT, () => {
    console.log(`Serveur prêt sur le port ${PORT}`);
});
