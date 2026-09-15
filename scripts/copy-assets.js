const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '..', 'src', 'utils', 'hack-trip-414441f1b5d4.json');
const destinationDir = path.join(__dirname, '..', 'build', 'utils');
const destination = path.join(destinationDir, 'hack-trip-414441f1b5d4.json');

fs.mkdirSync(destinationDir, { recursive: true });
fs.copyFileSync(source, destination);

console.log('Copied JSON asset to build/utils');