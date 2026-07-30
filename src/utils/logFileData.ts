import fs from 'node:fs/promises';
import path from 'node:path';

const logFileData = async (file: string, data: string) => {
  const currentDate = new Date().toISOString().split('T')[0];
  const logsDir = path.join(__dirname, '../../logs');

  await fs.mkdir(logsDir, { recursive: true });

  const fileName = path.join(logsDir, `${currentDate}-${file}.txt`);

  try {
    await fs.appendFile(fileName, data + '\n');
  } catch {
    await fs.writeFile(fileName, data + '\n');
  }
};

export { logFileData };
