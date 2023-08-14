const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path')

class Util {

    doRulesAllow(rules) {
        let finalAnswer = false;
        if (rules == null) {
            finalAnswer = true;
        } else {
            for (const allowedOS in rules) {
                if (rules[allowedOS].os == null) {
                    if (rules[allowedOS].action === 'allow') {
                        finalAnswer = true;
                    } else {
                        finalAnswer = false;
                    }
                } else {
                    if (rules[allowedOS].os.name === this.getOS()) {
                        if (rules[allowedOS].action === 'allow') {
                            finalAnswer = true;
                        } else {
                            finalAnswer = false;
                        }
                    }
                }
            }
        }
        return finalAnswer;
    }

    getOS() {
        const os = process.platform;
        let returnOS = '';
        if (os === "win32") returnOS = "windows";
        if (os === "darwin") returnOS = "osx";
        if (os === "linux") returnOS = "linux";

        return returnOS;
    }

    getJson(url) {
        return new Promise(resolve => {
            https.get(url, res => {
                res.setEncoding("utf8");
                let body = "";
                res.on("data", data => {
                    body += data;
                });
                res.on("end", () => {
                    body = JSON.parse(body);
                    resolve(body);
                });
            })
        });
    }

    writeJson(json, location) {
        if (!fs.existsSync(path.parse(location).dir))
            fs.mkdirSync(path.parse(location).dir, { recursive: true })
        fs.writeFile(location, json, function (err) {
            if (err) {
                return console.log(err);
            }
        });
    }

    async downloadIfInvalidDirAndName(hash, url, dir, name) {
        let location = path.join(dir, name)
        await this.downloadIfInvalid(hash, url, location)
        return new Promise(resolve => {
            resolve()
        })
    }

    async downloadIfInvalid(hash, url, location) {
        const valid = await this.isFileValid(hash, location);
        if (!valid)
            await this.downloadFile(url, location)
        return new Promise(resolve => {
            resolve()
        })
    }

    downloadFile(url, location) {
        return new Promise(resolve => {

            if (!fs.existsSync(path.parse(location).dir))
                fs.mkdirSync(path.parse(location).dir, { recursive: true })

            const file = fs.createWriteStream(location);
            https.get(url, function (response) {
                response.pipe(file);
                file.on("finish", () => {
                    file.close();
                    resolve(true)
                });

                file.on("error", () => {
                    file.close();
                    console.log("Error Downloading");
                    resolve(false)
                });
            });
        });
    }

    async isFileValid(hash, location) {
        return new Promise(resolve => {
            if (fs.existsSync(location)) {
                var fileStream = fs.createReadStream(location);
                var cryptoHash = crypto.createHash('sha1');
                fileStream.pipe(cryptoHash);
                fileStream.on('end', function () {
                    cryptoHash.end();
                    resolve(cryptoHash.digest('hex') === hash);
                });
            } else {
                resolve(false)
            }
        });
    }
}

module.exports = Util;