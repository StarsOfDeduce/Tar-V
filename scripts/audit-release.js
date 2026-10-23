const fs = require('fs');
const os = require('os');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const distDir = process.env.TARV_AUDIT_DIST
  ? path.resolve(projectRoot, process.env.TARV_AUDIT_DIST)
  : path.join(projectRoot, 'dist');
const unpackedDir = path.join(distDir, 'win-unpacked');
const { version } = require('../package.json');
const setupPath = path.join(distDir, `Tar V Setup ${version}.exe`);

function listFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => path.normalize(value)))];
}

function containsEncoded(buffer, value) {
  const variants = [
    Buffer.from(value, 'utf8'),
    Buffer.from(value, 'utf16le')
  ];
  return variants.some((needle) => needle.length > 0 && buffer.indexOf(needle) !== -1);
}

function scanText(buffer) {
  const text = `${buffer.toString('utf8')}\n${buffer.toString('utf16le')}`;
  const checks = [
    ['Windows 用户目录', /[a-z]:\\users\\[^\\\0\r\n]+/i],
    ['电子邮箱', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],
    ['手机号码', /(?:^|\D)1[3-9]\d{9}(?:\D|$)/],
    ['GitHub 访问令牌', /(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
    ['AWS 访问密钥', /AKIA[0-9A-Z]{16}/],
    ['私钥正文', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/]
  ];
  return checks.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

if (!fs.existsSync(unpackedDir) || !fs.existsSync(setupPath)) {
  throw new Error(`缺少 ${version} 发行产物，请先运行 npm run dist。`);
}

const username = process.env.USERNAME || '';
const shortUsername = username ? `${username.slice(0, 6).toUpperCase()}~1` : '';
const privateMarkers = unique([
  os.homedir(),
  process.env.USERPROFILE,
  projectRoot,
  path.dirname(projectRoot),
  shortUsername
]).filter((marker) => marker !== path.parse(marker).root);

const packagedFiles = [...listFiles(unpackedDir), setupPath];
const findings = [];

for (const filePath of packagedFiles) {
  const buffer = fs.readFileSync(filePath);
  for (const marker of privateMarkers) {
    if (containsEncoded(buffer, marker)) {
      findings.push({ filePath, category: '本机身份或构建路径' });
      break;
    }
  }
}

const appAsar = path.join(unpackedDir, 'resources', 'app.asar');
for (const category of scanText(fs.readFileSync(appAsar))) {
  findings.push({ filePath: appAsar, category });
}

if (findings.length > 0) {
  console.error('发行包脱敏检查失败：');
  for (const finding of findings) {
    console.error(`- ${finding.category}: ${path.relative(projectRoot, finding.filePath)}`);
  }
  process.exitCode = 1;
} else {
  console.log(`发行包脱敏检查通过：${packagedFiles.length} 个文件，未发现本机路径或常见密钥特征。`);
}
