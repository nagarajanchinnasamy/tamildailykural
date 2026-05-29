const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../data/thirukkural.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

let updatedCount = 0;
for (let kural of data.kural) {
  if (!kural.split || kural.split.length === 0) {
    kural.split = [kural.Line1, kural.Line2];
    updatedCount++;
  }
}

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log(`Successfully added default 'split' arrays to ${updatedCount} kurals. Manually customized splits were preserved.`);
