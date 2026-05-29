const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, 'data', 'thirukkural.json');
const kuralsData = require(jsonPath);

kuralsData.kural = kuralsData.kural.map(kural => {
  const words = kural.Line1.split(' ').filter(w => w.trim().length > 0);
  const title = words.slice(0, 2).join(' ');
  
  return {
    ...kural,
    title: title,
    tdk: kural.mk
  };
});

fs.writeFileSync(jsonPath, JSON.stringify(kuralsData, null, 2));
console.log('Successfully migrated thirukkural.json');
