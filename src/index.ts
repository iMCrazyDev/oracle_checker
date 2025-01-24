import { BackendPriceSource, IcpPriceSource, IotaPriceSource, MAINNET_POOL_CONFIG, PricesCollector, PriceSource, RawPriceData, verifyPricesSign, verifyPricesTimestamp } from "@evaafi/sdk";
import { OracleNFT } from "@evaafi/sdk/dist/types/Master";
import { exec } from "child_process";
import { configDotenv } from "dotenv";
configDotenv();

const ORACLE: string = process.env.ORACLE!;
const TRIGGER_TIME: number = Number(process.env.TRIGGER_TIME!);
const SLEEP_TIME: number = Number(process.env.SLEEP_TIME!);
const BOT_TOKEN = process.env.BOT_TOKEN!;
const CHAT_ID = process.env.CHAT_ID!;
const TOPIC_ID = Number(process.env.TOPIC_ID!);
const COMMANDS = JSON.parse(process.env.COMMANDS!);


const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
const sendMessageAndLog = async (message: string) => {
  try {
    const messageFormatted = '[' + ORACLE + '] ' + message;
    console.log(messageFormatted);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: messageFormatted,
        message_thread_id: TOPIC_ID
      }),
    });

    if (!response.ok) {
      throw new Error(`Error sending message: ${response.statusText}`);
    }

    const data = await response.json();
    //console.log('Message sent successfully', data);
  } catch (error) {
    console.error('Error sending message:', error);
  }
};

async function main() {
    const oracleToCheck = MAINNET_POOL_CONFIG.oracles.find(x => x.address == ORACLE);

    if (oracleToCheck === undefined) {
        sendMessageAndLog('Invalid oracle address in .env');
        return;
    }

    if (!Array.isArray(COMMANDS)) {
        sendMessageAndLog('Invalid oracle address in .env');
        return;
    }

    const oracles = [oracleToCheck];
    let errors = 0;
    while (errors < 3) {
        try {
            const icp = await checkSource(new IcpPriceSource('6khmc-aiaaa-aaaap-ansfq-cai.raw.icp0.io', oracles), oracles);
            const backend = await checkSource(new BackendPriceSource('evaa.space', oracles), oracles);
            const iota = await checkSource(new IotaPriceSource('api.stardust-mainnet.iotaledger.net', oracles), oracles);

            if (!iota || (!backend && !icp)) {
                errors++;
                await new Promise(resolve => setTimeout(resolve, SLEEP_TIME * 1000));
                continue;
            }

            sendMessageAndLog('Oracle is alive');
            return;
        }
        catch { errors++; }
    }

    if (errors == 3) {
        sendMessageAndLog('Executing comands');
        await new Promise(resolve => setTimeout(resolve, 1000));
        for (const command of COMMANDS) {
            try {
                await executeCommand(command);
            } catch (err) {
                sendMessageAndLog(`Failed to execute command: ${command} ${err}`);
            }
            await new Promise(resolve => setTimeout(resolve, SLEEP_TIME * 1000));
          }
    }

    
}

async function checkSource(priceSource: PriceSource, oracles: OracleNFT[]): Promise<boolean> {
    try {
       
        const price = (await priceSource.getPrices())[0];

        const timestamp = verifyTimestamp(price);
        const sign = verifyPricesSign(oracles)(price);
        if (!timestamp) {
            sendMessageAndLog(`Timestamp ${priceSource.sourceName} triggered`);
        }
        if (!sign) {
            sendMessageAndLog(`Invalid ${priceSource.sourceName} price sign!!`);
        }
        return timestamp && sign;
    }
    catch (err) {
        return false;
    }
}

function verifyTimestamp(priceData: RawPriceData) {
    const timestamp = Date.now() / 1000;
    const pricesTime = priceData.timestamp;

    //console.debug('timestamp - pricesTime, pricesTime', timestamp - pricesTime, pricesTime);
    //console.log(timestamp - pricesTime)
    return timestamp - pricesTime < TRIGGER_TIME;
}

function executeCommand(command: string): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          sendMessageAndLog(`Executing: ${command} Error: ${error.message}`);
          return reject(error);
        }
        if (stderr) {
            sendMessageAndLog(`Executing: ${command} Stderr: ${stderr}`);
        }
        sendMessageAndLog(`Executing: ${command} Stdout: ${stdout}`);
        resolve();
      });
    });
  }

main();