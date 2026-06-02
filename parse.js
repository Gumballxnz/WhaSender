const xlsx = require('xlsx');
const fs = require('fs');

const workbook = xlsx.readFile('f:/SITES E SAAS/CLONE SITES CLIENTES/automaçao/td.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

let numbers = [];
for (let i = 0; i < data.length; i++) {
  const row = data[i];
  if (!row || !row[1]) continue;

  const name = String(row[0] || '').trim();
  let phoneVal = String(row[1]).trim();
  
  if (name.toLowerCase().includes('gerson mov') || name.toLowerCase() === 'gerson') continue;

  let phone = phoneVal.replace(/\D/g, '');
  if (phone.length >= 8) {
    if (!phone.startsWith('258')) phone = '258' + phone;
    
    // Extrair o número presente no nome do contato (ex: "Ola 5" -> 5)
    const match = name.match(/\d+/);
    let partNum = i + 1; // Fallback sequencial se não houver dígito
    if (match) {
      partNum = parseInt(match[0]);
    }

    numbers.push({ originalName: name, phone: phone, partNum: partNum });
  }
}

// Ordenar os contatos pelo número da parte numericamente ascendente (parte_1, parte_2, etc.)
numbers.sort((a, b) => a.partNum - b.partNum);

if (numbers.length > 104) numbers = numbers.slice(0, 104);

let jsScript = `const db = require('better-sqlite3')('/opt/whasender/data/whasender.db');\n`;
jsScript += `db.prepare('DELETE FROM contacts').run();\n`;
jsScript += `const stmt = db.prepare('INSERT INTO contacts (name, phone, file_name, active) VALUES (?, ?, ?, ?)');\n`;
jsScript += `const insertMany = db.transaction((contacts) => {\n`;
jsScript += `  for (const c of contacts) stmt.run(c.name, c.phone, c.file_name, c.active);\n`;
jsScript += `});\n`;
jsScript += `const data = [\n`;
for (let i = 0; i < numbers.length; i++) {
  jsScript += `  { name: '${numbers[i].originalName}', phone: '${numbers[i].phone}', file_name: 'parte_${numbers[i].partNum}.xlsx', active: 1 },\n`;
}
jsScript += `];\n`;
jsScript += `insertMany(data);\n`;
jsScript += `db.prepare("UPDATE settings SET value='104' WHERE key='max_per_dispatch'").run();\n`;
jsScript += `console.log('Inseridos ' + data.length + ' contatos.');\n`;

fs.writeFileSync('f:/SITES E SAAS/CLONE SITES CLIENTES/automaçao/whasender/populate.js', jsScript);

