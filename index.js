require('dotenv').config()

const fs = require('fs')
const cp = require('child_process')
const path = require('path');
const { v4: uuidv4 } = require('uuid')

const TelegramBot = require('node-telegram-bot-api')
const token = process.env.BOT_TOKEN
const bot = new TelegramBot(token, { polling: true })
console.log('Bot has been started');

const filePath = path.join(__dirname, '/configs', '/wg0.conf')

const userConfigMapFilePath = path.join(__dirname, '/configs', 'userConfigMap.json');

// let userConfigMap = {};

const jsonUsersConfigs = './configs/userConfigMap.json'
const jsonUsersConfigsData = fs.readFileSync(jsonUsersConfigs, 'utf-8');
const usersConfigsData = JSON.parse(jsonUsersConfigsData);

const addPeers = async () => {
  try {
    bot.onText(/\/newconfig/, async (msg, match) => {
      const chatId = msg.chat.id
      await bot.sendMessage(chatId, 'Введите название для вашего VPN');
      step[`${chatId}`] = 'name';
    })

    bot.onText(/getconfig (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const userConfig = usersConfigsData[chatId];
      const config = match[1]
    
      if (userConfig) {
        let configsKeys = Object.keys(usersConfigsData[chatId].configs)
        let configName;
        
        for (let i = 0; i < configsKeys.length; i++) {
          let currentConfig = usersConfigsData[chatId].configs[configsKeys[i]]
          if (currentConfig.name === config) {
            configName = currentConfig.name

            const configPath = path.join(__dirname, '/configs', '/peer-configs', `/${chatId}`, `${configName}.conf`);
            await bot.sendDocument(chatId, configPath)
              .then(async () => {
                await bot.sendMessage(chatId, 'Приятного пользования');
              })
              .catch(err => {
                console.log('Ошибка при отправке конфига: ' + err);
              });
          }
        }
        if (!configName) {
          await bot.sendMessage(chatId, 'Конфигурация не найдена. Проверьте праивильность написания имени вашего конфига');
        }
      }
    });

    let step = {}

    const jsonConfig = './configs/wg0.json'
    const jsonData = fs.readFileSync(jsonConfig, 'utf-8');
    const data = JSON.parse(jsonData);
    const clients = data.clients

    const addresses = Object.values(clients).map(client => {
      if (client.hasOwnProperty("address")) {
        return client.address;
      }
    }).filter(Boolean);
    
    const sortedAddresses = addresses.sort((a, b) => {
      const aSplit = a.split('.').map(part => parseInt(part));
      const bSplit = b.split('.').map(part => parseInt(part));
      for (let i = 0; i < 4; i++) {
        if (aSplit[i] !== bSplit[i]) {
          return aSplit[i] - bSplit[i];
        }
      }
      return 0;
    });
    const highestAddress = sortedAddresses[sortedAddresses.length - 1];
    
    const addressArr = highestAddress.split('.')
    const lastElement = addressArr.length - 1
    const newLastElement = +addressArr[lastElement] + 1

    const newAddressArr = addressArr.slice(0, lastElement).concat(newLastElement)
    const newAddress = newAddressArr.join('.')

    bot.on('message', async (msg) => {
      const chatId = msg.chat.id;

      if (msg.text && msg.text.length > 0) {
        if (step[chatId] === 'name') {
          await bot.sendMessage(chatId, `Название вашего VPN: ${msg.text}`);
          await bot.sendMessage(chatId, 'Введите команду /getconfig (имя_конфига) не ранее, чем через 5 секунд после создания конфига');

          const userUuid = uuidv4()

          try {
            fs.mkdirSync(path.join(__dirname, 'configs', 'peer-keys', msg.text), { recursive: true });
            fs.mkdirSync(path.join(__dirname, 'configs', 'peer-configs', chatId.toString()), { recursive: true });
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
              `# Client: ${msg.text} (${userUuid})\n`,
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

            const configFolderPath = path.join(__dirname, 'configs', 'peer-configs', chatId.toString())

            for (let line of linesToAddToConfig) {
              fs.appendFileSync(path.join(configFolderPath, `${msg.text}.conf`), line)
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
              enabled: true
            };

            data.clients[userUuid] = client;
            
            const newData = JSON.stringify(data, null, 2)
            fs.writeFileSync(jsonConfig, newData);
            
            const jsonUsersConfigs = './configs/userConfigMap.json'
            const jsonUsersConfigsData = fs.readFileSync(jsonUsersConfigs, 'utf-8');
            const usersConfigsData = JSON.parse(jsonUsersConfigsData);

            const userConfigId = uuidv4()

            function addUserConfigById(chatId, uuid, name) {
              if (!usersConfigsData.hasOwnProperty(chatId)) {
                usersConfigsData[chatId] = {
                  uuid: userUuid,
                  configs: {
                    [uuid]: {
                      name
                    }
                  }
                }

                fs.writeFileSync(jsonUsersConfigs, JSON.stringify(usersConfigsData, null, 2))
              } else {
                const configs = {
                  [uuid]: {
                    name             
                  }
                }

                usersConfigsData[chatId.toString()].configs = Object.assign(usersConfigsData[chatId.toString()].configs, configs)
                fs.writeFileSync(jsonUsersConfigs, JSON.stringify(usersConfigsData, null, 2))
              }
            }
            addUserConfigById(chatId, userConfigId, msg.text);

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





bot.onText(/start/, msg => {
  const chatId = msg.chat.id

  bot.sendMessage(chatId, 'Привет, хочешь начать пользоваться VPN?\nВот список комманд:')
  bot.sendMessage(chatId, `/help — вывести список всех комманд
/newconfig — cоздать новый конфиг
/getconfig (имя созданного конфига) — скинуть имеющиеся конфиги
/support — написать в поддержку`)
})

// bot.onText(/getconfig/, async msg => {
//   const chatId = msg.chat.id
  
//   const configPath = path.join(__dirname, '/configs', '/peer-configs', `${configName}.conf`)

//   await bot.sendDocument(chatId, configPath)
//     .then(async () => {
//       await bot.sendMessage(chatId, 'Приятного пользоавния')
//     })
//     .catch(err => {
//       console.log('Ошибка при отправке конфига' + err);
//     })
// })

// bot.onText(/config/, async msg => {
//   const chatId = msg.chat.id

//   await bot.sendDocument(chatId, './configs/wg0.conf')
//     .then(async () => {
//       await bot.sendMessage(chatId, 'Документ отправлен')
//     })
//     .catch(err => {
//       console.log(err);
//     })
// })

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