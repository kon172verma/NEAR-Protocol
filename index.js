// Importing the required libraries.
const sha256 = require('js-sha256');
const fs = require('fs')
require('dotenv').config();

const nearAPI = require("near-api-js");
const { KeyPair, keyStores, connect } = nearAPI;
const { fullAccessKey } = require("near-api-js/lib/transaction");


class Transactions{

    // Function to create and execute transactions.
    executeTransaction = async(accountId, accountKEY, account2Id, actions) => {
        try{
            // Collecting the required information - keypair from secret key, provider, ...
            const keyPair = KeyPair.fromString(accountKEY);
            const networkId = 'testnet';
            const provider = new nearAPI.providers.JsonRpcProvider({ url: `https://rpc.${networkId}.near.org` });
            const accessKey = await provider.query(`access_key/${accountId}/${keyPair.getPublicKey().toString()}`, '');
            const nonce = accessKey.nonce + 1;
            const recentBlockHash = nearAPI.utils.serialize.base_decode(accessKey.block_hash);

            // Creating the transaction.
            const transaction = nearAPI.transactions.createTransaction(
                accountId,
                keyPair.getPublicKey(),
                account2Id,
                nonce,
                actions,
                recentBlockHash
            );
            
            // Serializing the transaction.
            const serializedTx = nearAPI.utils.serialize.serialize(nearAPI.transactions.SCHEMA, transaction);
            console.log('Serialized, Unsigned Transaction HEX:', Buffer.from(serializedTx).toString('hex'));

            // Generating the Hash for our transaction using SHA-256.
            const serializedTxHash = new Uint8Array(sha256.sha256.array(serializedTx));
            console.log('serializedTxHash', Buffer.from(serializedTxHash).toString('hex'));

            // Signing the transaction.
            const signature = keyPair.sign(serializedTxHash);
            const signedTransaction = new nearAPI.transactions.SignedTransaction({
                transaction,
                signature: new nearAPI.transactions.Signature({
                    keyType: transaction.publicKey.keyType,
                    data: signature.signature,
                }),
            });
            const signedSerializedTx = signedTransaction.encode();

            // Executing the transaction.
            const result = await provider.sendJsonRpc("broadcast_tx_commit", [
                Buffer.from(signedSerializedTx).toString("base64"),
            ]);

            // Checking if the transaction has executed successfully.
            if(result.status.Failure){
                console.log('Transaction Failed. Error:', result.status.Failure.ActionError.kind);
            }else{
                console.log('Transaction Successfully Executed.!');
            }
        }catch(err){
            console.log('Something went wrong. Error: ', err);
        }
    }

    // Function to transfer NEAR tokens from one account to other.
    // Accounts can be implicit or registered.
    transfer = async(sender, senderKey, receiver, value) => {
        const amount = nearAPI.utils.format.parseNearAmount(value);
        const actions = [nearAPI.transactions.transfer(amount)];
        await this.executeTransaction(sender, senderKey, receiver, actions);
    }

    // Function to add a key to an account. 
    // Here we just addd a fullAccessKey from a randomly generated key-pair.
    addKey = async(sender, senderKey) => {
        const keyPair = KeyPair.fromRandom("ed25519");
        console.log('Key generated and used: ', keyPair.secretKey);
        fs.writeFile('./keys/'+sender, keyPair.secretKey+'\n', {'flag': 'a'}, function(err) {
            if (err) { return console.error(err); }
        });
        const actions = [nearAPI.transactions.addKey(keyPair.getPublicKey(), fullAccessKey())];
        await this.executeTransaction(sender, senderKey, sender, actions);
    }

    // Function to list keys for an account.
    listKey = async(sender) => {
        const keyStore = new keyStores.InMemoryKeyStore();
        const config = { networkId: "testnet", keyStore, nodeUrl: "https://rpc.testnet.near.org" };
        const near = await connect(config);
        const account = await near.account(sender);
        const keys = await account.getAccessKeys();
        console.log('Keys', keys);
    }

    // Function to remove a key from an account.
    removeKey = async(sender, senderKey, key) => {
        const keyPair = KeyPair.fromString(key);
        const actions = [nearAPI.transactions.deleteKey(keyPair.getPublicKey())];
        await this.executeTransaction(sender, senderKey, sender, actions);
    }

    // Function to create a sub-account.
    // We save the secret key that we newly generated and assigned to the account.
    createAccount = async(sender, senderKey, accountId, value) => {
        const amount = nearAPI.utils.format.parseNearAmount(value);
        const keyPair = KeyPair.fromRandom("ed25519");    
        console.log('Key generated and used: ', keyPair.secretKey);
        fs.writeFile('./keys/'+accountId, keyPair.secretKey+'\n', {'flag': 'a'}, function(err) {
            if (err) { return console.error(err); }
        });
        const actions = [
            nearAPI.transactions.createAccount(),
            nearAPI.transactions.transfer(amount),
            nearAPI.transactions.addKey(keyPair.getPublicKey(),fullAccessKey())
        ];
        await this.executeTransaction(sender, senderKey, accountId, actions);
    }

    // Function to delete a sub account.
    deleteAccount = async(sender, senderKey) => {
        const actions = [nearAPI.transactions.deleteAccount(sender)];
        await this.executeTransaction(sender, senderKey, sender, actions);
    }

    // Function to stake NEAR tokens, at an account.
    stake = async(sender, senderKey, accountId, accountKey, value) => {
        const amount = nearAPI.utils.format.parseNearAmount(value);
        const actions = [nearAPI.transactions.stake(amount, accountKey)];
        await this.executeTransaction(sender, senderKey, accountId, actions);
    }

    // Function to stake NEAR tokens, at a smart-contract on validator's node.
    stakeCall = async(sender, senderKey, accountId, value) => {
        const amount = nearAPI.utils.format.parseNearAmount(value);
        const actions = [nearAPI.transactions.functionCall('deposit_and_stake', {}, '300000000000000', amount)];
        await this.executeTransaction(sender, senderKey, accountId, actions);
    }

    // Function to call a method from some smart-contract.
    functionCall = async(sender, senderKey, accountId, methodName) => {
        const actions = [nearAPI.transactions.functionCall(methodName, {}, '300000000000000')];
        await this.executeTransaction(sender, senderKey, accountId, actions);
    }

    main = async() => {
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        console.log('Choose an option:');
        console.log('1. Create a new sub-account');
        console.log('2. Delete a sub-account');
        console.log('3. Transfer NEAR Tokens from one account to another');
        console.log('4. Add a key to an account');
        console.log('5. List keys of an account');
        console.log('6. Delete a key from an account');
        console.log('7. Stake tokens at a validator node');
        console.log('8. Make a function call');
        readline.question('', option => {
            switch(option){
                case '1':
                    this.createAccount(
                        process.env.M1_ACCOUNT_1,
                        process.env.M1_PRIVATE_KEY,
                        process.env.M1_ACCOUNT_ID,
                        process.env.M1_VALUE
                    )
                    break;
                case '2':
                    this.deleteAccount(
                        process.env.M2_ACCOUNT_1,
                        process.env.M2_PRIVATE_KEY,
                    )
                    break
                case '3':
                    this.transfer(
                        process.env.M3_ACCOUNT_1,
                        process.env.M3_PRIVATE_KEY,
                        process.env.M3_ACCOUNT_2,
                        process.env.M3_VALUE
                    );
                    break;
                case '4':
                    this.addKey(
                        process.env.M4_ACCOUNT,
                        process.env.M4_PRIVATE_KEY,
                    );
                    break;
                case '5':
                    this.listKey(process.env.M5_ACCOUNT);
                    break;
                case '6':
                    this.removeKey(
                        process.env.M6_ACCOUNT,
                        process.env.M6_PRIVATE_KEY,
                        process.env.M6_KEY
                    );
                    break;
                case '7':
                    this.stakeCall(
                        process.env.M7_ACCOUNT_1,
                        process.env.M7_PRIVATE_KEY,
                        process.env.M7_ACCOUNT_ID,
                        process.env.M7_VALUE
                    )
                    break;
                case '8':
                    this.functionCall(
                        process.env.M8_ACCOUNT_1,
                        process.env.M8_PRIVATE_KEY,
                        process.env.M8_ACCOUNT_ID,
                        process.env.M8_METHOD_NAME
                    )
                    break;
                default:
                    console.log('Wrong option.!');
            }
            readline.close();
        });
    }

}

const transactions = new Transactions();
transactions.main()