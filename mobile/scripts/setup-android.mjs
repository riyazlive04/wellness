#!/usr/bin/env node
/**
 * Re-applies the local Android build configuration.
 *
 * WHY THIS EXISTS: `android/` is gitignored (Expo CNG regenerates it), and
 * `npx expo prebuild` CLEARS the folder — wiping the SDK path, the JDK pin and
 * the release signing config every time. Run this after any prebuild:
 *
 *   npx expo prebuild -p android
 *   node scripts/setup-android.mjs
 *   cd android && ./gradlew assembleRelease   (or bundleRelease for Play)
 *
 * It is idempotent — safe to run repeatedly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'android');

if (!fs.existsSync(androidDir)) {
  console.error('✖ android/ not found. Run `npx expo prebuild -p android` first.');
  process.exit(1);
}

// Adjust these two if your machine differs.
const SDK_DIR = 'C:/Users/Welcome-Pc/AppData/Local/Android/Sdk';
const JAVA_HOME = 'C:/Program Files/Android/Android Studio/jbr';

// 1. local.properties — tells Gradle where the Android SDK lives.
fs.writeFileSync(path.join(androidDir, 'local.properties'), `sdk.dir=${SDK_DIR}\n`);
console.log('✔ local.properties (sdk.dir)');

// 2. gradle.properties — pin the JDK and give the build enough heap.
const gpPath = path.join(androidDir, 'gradle.properties');
let gp = fs.readFileSync(gpPath, 'utf8');
gp = gp.replace(
  /org\.gradle\.jvmargs=.*/,
  'org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m',
);
if (!gp.includes('org.gradle.java.home')) {
  gp += `\n# JDK bundled with Android Studio (forward slashes avoid .properties escaping).\norg.gradle.java.home=${JAVA_HOME}\n`;
}
fs.writeFileSync(gpPath, gp);
console.log('✔ gradle.properties (java.home + heap)');

// 3. app/build.gradle — real release signing, read from gitignored credentials.
const bgPath = path.join(androidDir, 'app', 'build.gradle');
let bg = fs.readFileSync(bgPath, 'utf8');

if (bg.includes('signingConfigs.release')) {
  console.log('• build.gradle already has release signing — skipped');
} else {
  const releaseSigning = `
        release {
            // Credentials live outside android/ so prebuild can't delete them.
            // Falls back to the debug keystore when credentials are absent, so
            // a fresh clone still builds.
            def ksProps = new Properties()
            def ksFile = rootProject.file('../credentials/keystore.properties')
            if (ksFile.exists()) { ksProps.load(new FileInputStream(ksFile)) }
            storeFile file(ksProps.getProperty('storeFile', 'debug.keystore'))
            storePassword ksProps.getProperty('storePassword', 'android')
            keyAlias ksProps.getProperty('keyAlias', 'androiddebugkey')
            keyPassword ksProps.getProperty('keyPassword', 'android')
        }
`;
  // Append a release{} block inside signingConfigs { ... debug { ... } }
  const anchor = bg.indexOf('signingConfigs {');
  if (anchor === -1) throw new Error('Could not find signingConfigs block');
  const debugEnd = bg.indexOf('\n        }', anchor); // end of the debug {} block
  if (debugEnd === -1) throw new Error('Could not find end of debug signing config');
  const insertAt = debugEnd + '\n        }'.length;
  bg = bg.slice(0, insertAt) + '\n' + releaseSigning + bg.slice(insertAt);

  // Point the release BUILD TYPE at it. Both build types say
  // `signingConfig signingConfigs.debug`; the release one is the last.
  const needle = 'signingConfig signingConfigs.debug';
  const last = bg.lastIndexOf(needle);
  if (last === -1) throw new Error('Could not find release signingConfig');
  bg = bg.slice(0, last) + 'signingConfig signingConfigs.release' + bg.slice(last + needle.length);

  fs.writeFileSync(bgPath, bg);
  console.log('✔ build.gradle (release signing)');
}

console.log('\nAndroid build config ready.');

// gradle.properties `org.gradle.java.home` tells the Gradle DAEMON which JDK to
// use, but the gradlew launcher still needs a `java` on PATH just to start. On a
// machine whose only JDK is Android Studio's bundled JBR that's missing, and the
// build dies with "JAVA_HOME is not set" — which reads like a fault in this
// script rather than a shell-environment one. Say how to fix it.
if (!process.env.JAVA_HOME) {
  console.log(
    `\n⚠ JAVA_HOME is not set in this shell — gradlew needs it to launch:\n` +
      `    export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"    # Git Bash\n` +
      `    $env:JAVA_HOME = "${JAVA_HOME.replace(/\//g, '\\')}"   # PowerShell`,
  );
}
