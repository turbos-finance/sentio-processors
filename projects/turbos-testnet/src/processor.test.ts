import { TestProcessorServer, firstCounterValue } from '@sentio/sdk/testing'
import { mockTransferLog } from '@sentio/sdk/eth/builtin/erc20'
import { BigDecimal } from '@sentio/sdk'

describe('Test Processor', () => {
  const service = new TestProcessorServer(() => import('./processor.js'))

  test('day reward amount ', async () => {
    const amount = new BigDecimal(86400).multipliedBy('16421726').dividedBy(10 ** 9).toString();
    expect(amount).toEqual('1418.8371264');

    const amount1 = new BigDecimal(86400).multipliedBy('4960317460').dividedBy(10 ** 9).toString();
    expect(amount1).toEqual('428571.428544');
  })

  // beforeAll(async () => {
  //   await service.start()
  // })

  // test('has valid config', async () => {
  //   const config = await service.getConfig({})
  //   expect(config.contractConfigs.length > 0).toBeTruthy()
  // })

  // test('check transfer event handling', async () => {
  //   const resp = await service.eth.testLog(
  //     mockTransferLog('0x1e4ede388cbc9f4b5c79681b7f94d36a11abebc9', {
  //       from: '0x0000000000000000000000000000000000000000',
  //       to: '0xb329e39ebefd16f40d38f07643652ce17ca5bac1',
  //       value: 10n ** 18n * 10n,
  //     })
  //   )

  //   const tokenCounter = firstCounterValue(resp.result, 'token')
  //   expect(tokenCounter).toEqual(10n)
  // })
})
