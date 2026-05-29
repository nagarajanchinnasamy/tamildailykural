const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('tamilyearnames.html', 'utf8');
const $ = cheerio.load(html);

const years = [];

// The table seems to have two main sections horizontally per row.
$('tr').each((i, row) => {
  const tds = $(row).find('td');
  
  // Left side (columns 0 to 4)
  if (tds.length >= 5) {
    const leftText = $(tds[3]).text().replace(/\n/g, ' ').replace(/' /g, '').trim();
    if (leftText && leftText !== 'Name (in English)') {
      years.push(leftText);
    }
  }
  
  // Right side (columns 6 to 10)
  if (tds.length >= 11) {
    const rightText = $(tds[9]).text().replace(/\n/g, ' ').replace(/' /g, '').trim();
    if (rightText && rightText !== 'Name (in English)') {
      years.push(rightText);
    }
  }
});

fs.writeFileSync('extracted_years.json', JSON.stringify(years, null, 2));
console.log('Extracted', years.length, 'years');
