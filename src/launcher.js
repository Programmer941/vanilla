const path = require('path')
const AdmZip = require("adm-zip");
const child = require('child_process');
const Util = require('./util');
const util = new Util()
let os = util.getOS();


let manifest = "https://launchermeta.mojang.com/mc/game/version_manifest.json";
let javaManifest = "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";
let assetDirectory = "https://resources.download.minecraft.net/"

let rootFolder = '';
let globalClientVersion = '';
let globalAssetVersion = '';
let jarLocation = ''
let libraries = []
let directories = {
    assetIndexes: '',
    assetObjects: '',
    jre: '',
    libraries: '',
    natives:'',
    versions:''
}


class Launcher {
    async launch(version, root) {
        rootFolder = path.resolve(root);
        globalClientVersion = version;
        this.setDirectories();

        console.log("Playing Version: " + version + " In Directory: " + rootFolder);
        const versionJson = await this.getVersionJson();
        await this.downloadAssets(versionJson);
        await this.downloadLibraries(versionJson);
        await this.downloadAndExtractNatives(versionJson);
        await this.downloadClientAndJar(versionJson);
        await this.downloadJava(versionJson);
        await this.configureRunArgumentsAndRun(versionJson);
    }

    setDirectories() {
        directories.assetIndexes = path.join(rootFolder, "assets", "indexes");
        directories.assetObjects = path.join(rootFolder, "assets", "objects");
        directories.jre = path.join(rootFolder, "jre");
        directories.libraries = path.join(rootFolder, "libraries");
        directories.natives = path.join(rootFolder,"natives");
        directories.versions = path.join(rootFolder,"versions");
    }

    async getVersionJson() {
        const manifestJson = await util.getJson(manifest);
        for (const version in manifestJson.versions) {
            if (manifestJson.versions[version].id == globalClientVersion) {
                const versionJson = await util.getJson(manifestJson.versions[version].url);
                return new Promise(resolve => {
                    resolve(versionJson);
                })
            }
        }
    }

    async downloadAssets(versionJson) {
        console.log("downloading assets");
        const assetURL = versionJson.assetIndex.url;
        const assetVersion = versionJson.assetIndex.id;
        globalAssetVersion=assetVersion;
        const assetSha = versionJson.assetIndex.sha1;

        const assets = await util.getJson(assetURL);
        await util.downloadIfInvalidDirAndName(assetSha, assetURL, directories.assetIndexes, + assetVersion + ".json");

        for (const asset in assets.objects) {
            let hash = assets.objects[asset].hash;
            let hashFirst2 = hash.slice(0, 2);
            let assetUrl = path.join(assetDirectory, hashFirst2, hash);
            await util.downloadIfInvalidDirAndName(hash,assetUrl, path.join(directories.assetObjects, hashFirst2), hash);
        }
    }

    async downloadLibraries(versionJson){
        console.log("downloading libraries");
        for (const library in versionJson.libraries) {

                const rules = versionJson.libraries[library].rules;
                const download = util.doRulesAllow(rules);

            if(download){
                if (versionJson.libraries[library].downloads.artifact != null) {
                    const libraryPath = versionJson.libraries[library].downloads.artifact.path;

                    
                    const librarySha = versionJson.libraries[library].downloads.artifact.sha1;
                    let libraryURL = versionJson.libraries[library].downloads.artifact.url;
                    const libraryName = path.parse(libraryPath).base;
                    const libraryDir = path.parse(libraryPath).dir;
                    const librarySetPath = path.join(rootFolder, "libraries", libraryDir);

                    if(libraryName.includes("log4j-api")){
                            libraryURL="https://libraries.minecraft.net/org/apache/logging/log4j/log4j-api/2.19.0/log4j-api-2.19.0.jar";
                            console.log("updating log4j api");
                    }
                    if(libraryName.includes("log4j-core")){
                            libraryURL="https://libraries.minecraft.net/org/apache/logging/log4j/log4j-core/2.19.0/log4j-core-2.19.0.jar";
                            console.log("updating log4j core");
                    }

                    await util.downloadIfInvalidDirAndName(librarySha, libraryURL, librarySetPath, libraryName);
                    libraries.push(path.join(librarySetPath, libraryName));
                }
            }
        }
    }

    async downloadAndExtractNatives(versionJson){
        console.log("downloading natives");
        for (const library in versionJson.libraries) {
            if (versionJson.libraries[library].downloads.classifiers != null) {
                const relativeOSName = versionJson.libraries[library].natives[os];
                const rules = versionJson.libraries[library].rules;
                const download = util.doRulesAllow(rules);


                if (download) {
                    let osNameFix = relativeOSName;
                    const arch = process.arch.replace(/[^0-9]/g, '');
                    if (osNameFix.includes("${arch}")) {
                        osNameFix = osNameFix.replace("${arch}", arch);
                    }

                    const nativeSha = versionJson.libraries[library].downloads.classifiers[osNameFix].sha1;
                    const nativeURL = versionJson.libraries[library].downloads.classifiers[osNameFix].url;
                    const nativeFile = path.parse(nativeURL).base;
                    await util.downloadIfInvalidDirAndName(nativeSha, nativeURL, path.join(directories.natives, globalClientVersion), nativeFile);
                     let zip = new AdmZip(path.join(directories.natives, globalClientVersion, nativeFile));
                    await zip.extractAllTo(path.join(directories.natives, globalClientVersion));
                }
            }
        }
    }

    async downloadClientAndJar(versionJson){
        console.log("downloading client");
        const clientSha1 = versionJson.downloads.client.sha1;
        const clientJar = versionJson.downloads.client.url;

        await util.writeJson(JSON.stringify(versionJson),path.join(directories.versions,globalClientVersion,globalClientVersion+".json"));
        await util.downloadIfInvalidDirAndName(clientSha1, clientJar, path.join(directories.versions, globalClientVersion), globalClientVersion + ".jar");
        jarLocation = path.join(directories.versions, globalClientVersion, globalClientVersion) + ".jar";
    }

    async downloadJava(versionJson) {
        console.log("downloading java");
        const javaType = versionJson.javaVersion.component;
        //const javaMajorVersion = versionJson.javaVersion.majorVersion;
        const javaVersions = await util.getJson(javaManifest);
        if (os === "osx") os = "mac-os";
        const osArch = os + "-" + process.arch;
        if (javaVersions[osArch] != null) {
            const javaVersion = javaVersions[osArch][javaType][0].version.name;
            const jreManifest = await util.getJson(javaVersions[osArch][javaType][0].manifest.url);
            for (const file in jreManifest.files) {
                if (jreManifest.files[file].type == "file") {
                    const url = jreManifest.files[file].downloads.raw.url;
                    const sha = jreManifest.files[file].downloads.raw.sha1;
                    await util.downloadIfInvalid(sha, url, path.join(directories.jre, globalClientVersion, file));
                }
            }
        } else {
            console.log("Couldn't find valid java");
        }
    }

    configureRunArgumentsAndRun(versionJson){
        console.log("launching!");
        let argumentsArray = [];
        let separator = ':';
        if(os==="windows")
        separator = ';';

        let jvm = [
            `-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump`,
            '-XX:-UseAdaptiveSizePolicy',
            '-XX:-OmitStackTraceInFastThrow',
            '-Dfml.ignorePatchDiscrepancies=true',
            '-Dfml.ignoreInvalidMinecraftCertificates=true',
            `-Djava.library.path=${rootFolder}/natives/${globalClientVersion}`,
            `-Xmx8G`,
            `-Xms4G`
        ]

        let launchArgs = [
            '--accessToken', 0,
            '--version', globalClientVersion,
            '--assetsDir', path.join(rootFolder, "assets"),
            '--assetIndex', globalAssetVersion
        ]
        const classPaths = '-cp';
        const mainClass = versionJson.mainClass;

        libraries.push(jarLocation);
        argumentsArray = argumentsArray.concat(jvm, classPaths, libraries.join(separator), mainClass, launchArgs);

        console.log("Running")
        console.log(argumentsArray)

        const minecraft = child.spawn('java', argumentsArray, { cwd: path.join(directories.jre, globalClientVersion, "bin") });
        minecraft.stdout.on('data', (data) => console.log(data.toString('utf-8')));
        minecraft.stderr.on('data', (data) => console.log(data.toString('utf-8')));
    }
}

module.exports=Launcher;