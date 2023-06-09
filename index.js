require('dotenv').config()

const fs = require('fs')
const cp = require('child_process')
const path = require('path');
const { v4: uuidv4 } = require('uuid')

const TelegramBot = require('node-telegram-bot-api')
const token = process.env.TOKEN

const bot = new TelegramBot(token, { polling: true })
console.log('Bot has been started');

const filePath = path.join(__dirname, '/configs', '/wg0.conf')

const addPeers = async () => {
  try {
    bot.onText(/\/newconfig/, async (msg, match) => {
      const chatId = msg.chat.id
      await bot.sendMessage(chatId, 'Введите название для вашего VPN');
      step[`${chatId}`] = 'name';
    })

    let step = {}

    const jsonConfig = './configs/wg0.json'
    const jsonData = fs.readFileSync(jsonConfig, 'utf-8');
    const data = JSON.parse(jsonData);
    const clients = data.clients
    const keys = Object.keys(clients);
    const lastKey = keys[keys.length - 1];
    const lastValue = clients[lastKey];
    
    const address = lastValue.address
    const addressArr = address.split('.')
    const lastElement = addressArr.length - 1
    const newLastElement = +addressArr[lastElement] + 1

    const newAddressArr = addressArr.slice(0, lastElement).concat(newLastElement)
    const newAddress = newAddressArr.join('.')

    bot.on('message', async (msg) => {
      const chatId = msg.chat.id;

      if (msg.text && msg.text.length > 0) {
        if (step[chatId] === 'name') {
          await bot.sendMessage(chatId, `Название вашего VPN: ${msg.text}`);

          const uuid = uuidv4()

          try {
            fs.mkdirSync(path.join(__dirname, 'configs', 'peer-keys', msg.text), { recursive: true });
          } catch (err) {
            console.error(err);
          }
          const folderPath = path.join(__dirname, 'configs', 'peer-keys', msg.text);
          
          const filePathPrivateKey = path.join(folderPath, `${msg.text}-private-key`)
          const filePathPublicKey = path.join(folderPath, `${msg.text}-public-key`)
          const filePathPreSharedKey = path.join(folderPath, `${msg.text}-preshared-key`)

          const command = `wg genkey > ${filePathPrivateKey} && wg pubkey < ${filePathPrivateKey} > ${filePathPublicKey} && wg genpsk > ${filePathPreSharedKey}`

          cp.exec(command, (error, stdout, stderr) => {
            if (error) {
              console.log('Error: ', error);
            }
          })

          setTimeout(async () => {
            const privateKey = fs.readFileSync(filePathPrivateKey, 'utf8')
            const publicKey = fs.readFileSync(filePathPublicKey, 'utf8')
            const preSharedKey = fs.readFileSync(filePathPreSharedKey, 'utf8')

            const address = newAddress

            const linesToAdd = [
              `# Client: ${msg.text} (${uuid})\n`,
              `[Peer]\n`, 
              `PublicKey = ${publicKey}`,
              `PresharedKey = ${preSharedKey}`,
              `AllowedIPs = ${address}/32`,
              '\n',
              '\n',
            ]

            for (let line of linesToAdd) {
              fs.appendFileSync(filePath, line)
            }

            const linesToAddToConfig = [
              `[Interface]\n`, 
              `PrivateKey = ${privateKey}`,
              `Address = ${address}/24\n`,
              'DNS = 1.1.1.1\n',
              '\n',
              '[Peer]\n',
              `PublicKey = ${publicKey}`,
              `PresharedKey = ${preSharedKey}`,
              `AllowedIPs = 0.0.0.0/0, ::/0\n`,
              'PersistentKeepalive = 0\n',
              'Endpoint = 95.140.153.56:51820'
            ]

            for (let line of linesToAddToConfig) {
              fs.appendFileSync(`configs/peer-configs/${msg.text}.conf`, line)
            }

            const jsonConfig = './configs/wg0.json'
            const jsonData = fs.readFileSync(jsonConfig, 'utf-8');
            const data = JSON.parse(jsonData);

            const peerDate = new Date()
            const isoDate = peerDate.toISOString();

            const client = {
              name: msg.text,
              address,
              privateKey: privateKey.trim(),
              publicKey: publicKey.trim(),
              preSharedKey: preSharedKey.trim(),
              createdAt: isoDate,
              updatedAt: isoDate,
              enabled: false
            };

            data.clients[uuid] = client;
            
            const newData = JSON.stringify(data, null, 2)
            fs.writeFileSync(jsonConfig, newData);
            
          }, 2000)

          step[`${chatId}`] = null;
        }
      }
    })

  } catch (error) {
    console.log('Ошибка: ', error);
  }
}

addPeers()

// bot.onText(/\/start/, msg => {
//   const chatId = msg.chat.id

//   bot.sendMessage(chatId, 'Выберите длительность подписки', {
//     reply_markup: {
//       keyboard: [
//         [{ text: '1 месяц - 100 рубелй' }],
//         [{ text: '3 месяца - 250 рубелй' }],
//         [{ text: '1 год - 1000 рубелй' }]
//       ]
//     }
//   })
// })

// bot.on('message', msg => {
//   const chatId = msg.chat.id
//   const text = msg.text

//   if (text === '1 месяц - 100 рубелй') {
//     bot.sendMessage(chatId, 'Вы выбрали подписку на 1 месяц за 100 рублей. Оплатить подписку можно переводом на QIWI: *номер*', {
//       reply_markup: {
//         keyboard: [
//           [{ text: 'Готово' }]
//         ]
//       }
//     })
//   }

//   if (text === '3 месяца - 250 рубелй') {
//     bot.sendMessage(chatId, 'Вы выбрали подписку на 3 месяца за 250 рублей. Оплатить подписку можно переводом на QIWI: *номер*', {
//       reply_markup: {
//         keyboard: [
//           [{ text: 'Готово' }]
//         ]
//       }
//     })
//   }

//   if (text === '1 год - 1000 рубелй') {
//     bot.sendMessage(chatId, 'Вы выбрали подписку на 1 год за 1000 рублей. Оплатить подписку можно переводом на QIWI: *номер*', {
//       reply_markup: {
//         keyboard: [
//           [{ text: 'Готово' }]
//         ]
//       }
//     })
//   }

//   if (text === 'Готово') {
//     bot.forwardMessage(chatId, '@yaxxei', msg.message_id)
//   }
// })