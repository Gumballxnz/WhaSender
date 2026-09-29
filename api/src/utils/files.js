function sortFilesNumerically(files, nameExtractor = (f) => f && (f.name || f.fileName || f)) {
  return files.sort((a, b) => {
    const strA = nameExtractor(a) || '';
    const strB = nameExtractor(b) || '';
    const numA = parseInt(strA.match(/\d+/)?.[0] || 0, 10);
    const numB = parseInt(strB.match(/\d+/)?.[0] || 0, 10);
    return numA - numB;
  });
}

module.exports = {
  sortFilesNumerically,
};
