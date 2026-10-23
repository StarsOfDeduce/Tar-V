'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createIconService } = require('../lib/icon-service');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tar-v-icon-service-'));
  const executable = path.join(root, 'app.exe');
  const iconFile = path.join(root, 'app.ico');
  fs.writeFileSync(executable, 'exe');
  fs.writeFileSync(iconFile, 'ico');

  let extractCalls = 0;
  const fallbackIcons = {
    file: 'data:image/svg+xml;base64,file',
    folder: 'data:image/svg+xml;base64,folder',
    web: 'data:image/svg+xml;base64,web',
    steam: 'data:image/svg+xml;base64,steam'
  };
  const service = createIconService({
    app: {
      getFileIcon: async () => ({ isEmpty: () => false, toDataURL: () => 'data:image/png;base64,shell' })
    },
    nativeImage: {
      createFromPath: () => ({ isEmpty: () => false, toDataURL: () => 'data:image/png;base64,direct' })
    },
    extractExecutableIcon: async (filePath, index) => {
      extractCalls++;
      await new Promise((resolve) => setTimeout(resolve, 15));
      return Buffer.from(`${filePath}:${index}`).toString('base64');
    },
    cacheDir: path.join(root, 'cache'),
    fallbackIcons
  });

  const [first, second] = await Promise.all([
    service.getIcon({ path: executable }),
    service.getIcon({ path: executable })
  ]);
  assert.strictEqual(first, second, '同一个请求应共享结果');
  assert.strictEqual(extractCalls, 1, '并发请求应只提取一次');

  const hot = await service.getIcon({ path: executable });
  assert.strictEqual(hot, first);
  assert.strictEqual(extractCalls, 1, '热缓存不应重复提取');

  await service.getIcon({ path: executable }, { forceRefresh: true });
  assert.strictEqual(extractCalls, 2, '强制刷新应重新提取');

  const direct = await service.getIcon({ path: executable, iconPath: iconFile });
  assert.strictEqual(direct, 'data:image/png;base64,direct', '显式 ICO 应按图像内容读取');
  assert.strictEqual(await service.getIcon({ path: 'steam://rungameid/123' }), fallbackIcons.steam);
  assert.ok(service.stats().entries >= 2);

  service.dispose();
  fs.rmSync(root, { recursive: true, force: true });
  console.log('通过 7 项，失败 0 项');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
