require('dotenv').config()

const fs = require('fs')
const cp = require('child_process')
const path = require('path');
const { v4: uuidv4 } = require('uuid')
const pm2 = require('pm2')

const TelegramBot = require('node-telegram-bot-api')
const token = process.env.BOT_TOKEN
const bot = new TelegramBot(token, { polling: true })
console.log('Bot has been started');

const filePath = '../.wg-easy/wg0.conf'

try {
  fs.mkdirSync(path.join(__dirname, 'configs'), { recursive: true });
  fs.mkdirSync(path.join(__dirname, 'configs', 'peer-keys'), { recursive: true });
  fs.mkdirSync(path.join(__dirname, 'configs', 'peer-configs'), { recursive: true });
} catch (err) {
  console.error(err);
}

const userConfigMapFilePath = path.join(__dirname, '/configs', 'userConfigMap.json');

if (!fs.existsSync(userConfigMapFilePath)) {
  fs.writeFileSync(userConfigMapFilePath, JSON.stringify({}));
}

const jsonUsersConfigs = './configs/userConfigMap.json'
const jsonUsersConfigsData = fs.readFileSync(jsonUsersConfigs, 'utf-8');
const usersConfigsData = JSON.parse(jsonUsersConfigsData);

const addPeers = async () => {
  try {
    bot.onText(/\/newconfig (.+)/, async (msg, match) => {
      const chatId = msg.chat.id
      const name = match[1]

      await bot.sendMessage(chatId, `Название вашего VPN: ${name}`);
      await bot.sendMessage(chatId, 'Введите команду /getconfig (имя_конфига) не ранее, чем через 5 секунд после создания конфига');

      const configUuid = uuidv4()

      try {
        fs.mkdirSync(path.join(__dirname, 'configs', 'peer-keys', name), { recursive: true });
        fs.mkdirSync(path.join(__dirname, 'configs', 'peer-configs', chatId.toString()), { recursive: true });
      } catch (err) {
        console.error(err);
      }
      const folderPath = path.join(__dirname, 'configs', 'peer-keys', name);

      const filePathPrivateKey = path.join(folderPath, `${name}-private-key`)
      const filePathPublicKey = path.join(folderPath, `${name}-public-key`)
      const filePathPreSharedKey = path.join(folderPath, `${name}-preshared-key`)

      const command = `wg genkey > ${filePathPrivateKey} && wg pubkey < ${filePathPrivateKey} > ${filePathPublicKey} && wg genpsk > ${filePathPreSharedKey}`

      cp.exec(command, (error, stdout, stderr) => {
        if (error) {
          console.log('Error: ', error);
        }
      })

      new Promise((res, rej) => {
        setTimeout(async () => {
          try {
            const privateKey = fs.readFileSync(filePathPrivateKey, 'utf8')
            const publicKey = fs.readFileSync(filePathPublicKey, 'utf8')
            const preSharedKey = fs.readFileSync(filePathPreSharedKey, 'utf8')

            const address = newAddress

            const linesToAdd = [
              `# Client: ${name} (${configUuid})\n`,
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

            const jsonConfig = '../.wg-easy/wg0.json'
            const jsonData = fs.readFileSync(jsonConfig, 'utf-8');
            const data = JSON.parse(jsonData);

            const serverPublicKey = data.server.publicKey

            const linesToAddToConfig = [
              `[Interface]\n`,
              `PrivateKey = ${privateKey}`,
              `Address = ${address}/24\n`,
              'DNS = 1.1.1.1\n',
              '\n',
              '[Peer]\n',
              `PublicKey = ${serverPublicKey}\n`,
              `PresharedKey = ${preSharedKey}`,
              `AllowedIPs = 0.0.0.0/0, ::/0\n`,
              'PersistentKeepalive = 0\n',
              'Endpoint = 95.140.153.56:51820'
            ]

            const configFolderPath = path.join(__dirname, 'configs', 'peer-configs', chatId.toString())

            for (let line of linesToAddToConfig) {
              fs.appendFileSync(path.join(configFolderPath, `${name}.conf`), line)
            }

            const peerDate = new Date()
            const isoDate = peerDate.toISOString();

            const client = {
              name: name,
              address,
              privateKey: privateKey.trim(),
              publicKey: publicKey.trim(),
              preSharedKey: preSharedKey.trim(),
              createdAt: isoDate,
              updatedAt: isoDate,
              enabled: true
            };

            data.clients[configUuid] = client;

            const newData = JSON.stringify(data, null, 2)
            fs.writeFileSync(jsonConfig, newData);

            const userConfigId = uuidv4()

            function addUserConfigById(chatId, uuid, name) {
              if (!usersConfigsData.hasOwnProperty(chatId)) {
                usersConfigsData[chatId] = {
                  uuid: userConfigId,
                  configs: {
                    [uuid]: {
                      name,
                      date: isoDate
                    }
                  }
                }

                fs.writeFileSync(jsonUsersConfigs, JSON.stringify(usersConfigsData, null, 2))
              } else {
                const configs = {
                  [uuid]: {
                    name,
                    date: isoDate
                  }
                }

                usersConfigsData[chatId.toString()].configs = Object.assign(usersConfigsData[chatId.toString()].configs, configs)
                fs.writeFileSync(jsonUsersConfigs, JSON.stringify(usersConfigsData, null, 2))
              }
            }
            addUserConfigById(chatId, configUuid, name);

            res('Конфиги созданы')
          } catch (error) {
            rej(error)
          }
        }, 2000)
      })
        .then(() => {
          let command = 'systemctl restart wg-quick@wg0'
          cp.exec(command, (error, stdout, stderr) => {
            if (error) {
              console.log('Error: ', error);
            }
          })
        })
        .catch(err => console.log(err))
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

    const jsonConfig = '../.wg-easy/wg0.json'
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

  } catch (error) {
    console.log('Ошибка: ', error);
  }
}
addPeers()

bot.onText(/start/, msg => {
  const chatId = msg.chat.id

  bot.sendMessage(chatId, 'Привет, хочешь начать пользоваться VPN?\nВот список комманд:')
  bot.sendMessage(chatId, `/help — пошаговая помощь
/newconfig (имя_конфига) — cоздать новый конфиг
/getconfig (имя_конфига) — скинуть конфиг
/support — написать в поддержку`)
})

bot.onText(/help/, msg => {
  const chatId = msg.chat.id

  bot.sendMessage(chatId, `
Первым делом вам нужно будет создать конфиг, для этого пропишите команду /newconfig (имя_конфига)
Обратите внимание, что если имя конфига состоит из нескольких слов, то их нужно разделить нижним подчеркиванием.
  
После того, как вы создали конфиг, вам нужно будет получить файл с расширением .conf, для этого пропишите команду /getconfig (имя_конфига).
(Имя_конфига) — это имя ранее созданных вами конфигураций. После этого бот отправит вам документ.
  
И так, после того, как вы выполнили предыдущие шаги, вам нужно будет установить приложение WireGuard на ваш ПК или телефон.

Добавление конфигурации на ПК:
1. Запустите приложение,
2. Нажмите на кнопку (Добавить туннель),
3. Выберите файл конфигурации, которое вы получили от бота.
  
Добавление конфигурации на телефоне:
1. Запустите приложение,
2. Нажмите на кнопку (+),
3. После чего в появившемся окне выберите вариант (Импорт из файла или архива),
4. Выберите файл конфигурации, которое вы получили от бота.

Если у вас возникли какие-либо проблемы, вы можете обратиться в поддержку командой /support.
`)
})

bot.onText(/support/, msg => {
  const chatId = msg.chat.id

  bot.sendMessage(chatId, 'Для связи с нами напишите о вашей проблеме в @yaxxei')
})


// let a = 2
// let b = 3
// new Promise((res, rej) => {
//   setTimeout(() => {
//     a += b
//     console.log(a);
//     res(a)
//   }, 2000)
// })
//   .then(res => {
//     a = 6
//     console.log(a)
//   })
//   .catch(err => {
//     console.log(err);
//   })