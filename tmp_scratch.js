const fs = require('fs');
const kurals = require('./data/thirukkural.json');

const updatedKurals = kurals.kural.map(kural => {
  // 1. Extract first two words for title
  const words = kural.Line1.split(' ').filter(w => w.trim().length > 0);
  const title = words.slice(0, 2).join(' ');
  
  // 2. Add tdk field, copying mk
  return {
    ...kural,
    title: title,
    tdk: kural.mk
  };
});

// Check a sample
console.log(updatedKurals[0]);
console.log("Total length:", updatedKurals.length);
