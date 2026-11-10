const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Base de données SQLite locale
const dbFile = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
    if (!err) {
        console.log('Connecté à la base de données locale.');
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

// Routes API
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
    console.log(`L'application tourne sur : http://localhost:${PORT}`);
});