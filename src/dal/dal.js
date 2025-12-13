const fs = require('fs');
const path = require('path');

const dataDir = './data';

// Create data directory if it doesn't exist
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// Function to read data from a JSON file
const readData = (filename) => {
  const filePath = `${dataDir}/${filename}.json`;
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading data from ${filename}.json: ${error}`);
    return null;
  }
};

// Function to write data to a JSON file
const writeData = (filename, data) => {
  const filePath = `${dataDir}/${filename}.json`;
  const dir = path.dirname(filePath);

  // Create directory if it doesn't exist
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Data written to ${filename}.json`);
  } catch (error) {
    console.error(`Error writing data to ${filename}.json: ${error}`);
  }
};

module.exports = {
  readData,
  writeData
};