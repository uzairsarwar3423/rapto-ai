const fs = require('fs');
const content = fs.readFileSync('.env', 'utf-8');
const cleaned = content.split('\n').map(line => {
  const i = line.indexOf('=');
  if (i > -1 && !line.startsWith('#')) {
    const key = line.slice(0, i);
    let val = line.slice(i + 1);
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    if (key === 'REDIS_URL' && val.includes('localhost')) {
      val = val.replace('localhost', 'host.docker.internal');
      return `${key}=${val}\nREDIS_HOST=host.docker.internal\nREDIS_PORT=6379`;
    } else if (key === 'REDIS_URL') {
      const url = new URL(val);
      return `${key}=${val}\nREDIS_HOST=${url.hostname}\nREDIS_PORT=${url.port || 6379}`;
    }
    return `${key}=${val}`;
  }
  return line;
}).join('\n');
fs.writeFileSync('.env.docker', cleaned);
console.log('Cleaned .env created at .env.docker');
