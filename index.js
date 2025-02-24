const fs = require("fs");
const archiver = require("archiver");
const yaml = require("js-yaml");
const path = require("path");
const ProgressBar = require("progress");
const chalk = require("chalk");
const { promisify } = require("util");

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// Function to generate zip filename based on local date and folder name
const generateZipFilename = (folderPath) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`; // Format: YYYY-MM-DD_HH-MM-SS
  const folderName = path.basename(folderPath);
  return `${timestamp}_${folderName}.zip`;
};

// Function to get total folder size recursively
const getFolderSize = async (folderPath) => {
  let totalSize = 0;

  const getSize = async (dir) => {
    const files = await readdir(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const fileStat = await stat(fullPath);
      if (fileStat.isDirectory()) {
        await getSize(fullPath);
      } else {
        totalSize += fileStat.size;
      }
    }
  };

  await getSize(folderPath);
  return totalSize;
};

// Function to convert bytes into KB, MB, GB, or TB
const convertSize = (bytes, decimals = 2) => {
  if (bytes === 0) return { size: 0, unit: "bytes" };

  const sizes = ["bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = parseFloat((bytes / Math.pow(1024, i)).toFixed(decimals));

  return { size, unit: sizes[i] };
};

// Function to zip a folder and display a progress bar
const zipFolder = async (folderPath, outputZipPath) => {
  const output = fs.createWriteStream(outputZipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  let bar = null;
  let lastPrintedProgress = 0;

  const totalBytes = await getFolderSize(folderPath); // Compute total size before zipping
  const { size: totalSize, unit: sizeUnit } = convertSize(totalBytes, 2); // Convert to readable format

  if (totalBytes > 0) {
    bar = new ProgressBar(
      `${chalk.cyan("Zipping")} [:bar] ${chalk.green(":percent")} ${chalk.magenta(":etas")}`,
      {
        total: totalBytes,
        width: 30,
        clear: true,
        incomplete: chalk.gray(" "), // gray for incomplete part
        complete: chalk.green("="), // green for completed part
      }
    );
  }

  output.on("close", () => {
    if (bar) bar.update(1); // Ensure it reaches 100%

    const zipSize = fs.statSync(outputZipPath).size;
    const { size: finalSize, unit: finalUnit } = convertSize(zipSize, 2);
    console.log(
      `✅ ${chalk.bold("Successfully zipped:")} ${chalk.red(totalSize, sizeUnit)} -> ${chalk.green(
        finalSize,
        finalUnit
      )}`
    );
  });

  archive.on("error", (err) => {
    throw err;
  });

  archive.on("progress", (data) => {
    if (bar) {
      const progress = data.fs.processedBytes / totalBytes;
      if (progress - lastPrintedProgress >= 0.01) {
        // Update every 1%
        bar.update(progress);
        lastPrintedProgress = progress;
      }
    }
  });

  archive.pipe(output);
  archive.directory(folderPath, false);
  archive.finalize();
};

if (!fs.existsSync("backup.yaml")) {
  const yamlContents = `# BACKUP PROGRAM CONFIGUATION FILE
# Please fill out this file before running the backup program. Ensure all paths are in absolute form, and replace backslashes with double backslashes.

# FOLDER TO ZIP
# This is the folder that will be zipped. It should be an absolute path.
folderName: ""

# ZIP FOLDER
# This is the folder where the zipped file will be saved. It should be an absolute path.
# Do not include the filename, it is created automatically!
zipFolder: ""
`;

  console.log(
    chalk.red(
      "🚫 No backup.yaml file found! The file has been created, please edit it before running this program again!\n"
    )
  );
  fs.writeFileSync("backup.yaml", yamlContents);

  process.exit(1);
}

const { folderName, zipFolder: zipFolderName } = yaml.load(fs.readFileSync("backup.yaml", "utf8"));
const zipPath = path.join(zipFolderName, generateZipFilename(folderName));

console.log(`📦 ${chalk.bold("Zipping folder:")} ${chalk.green(folderName)}`);
console.log(`📂 ${chalk.bold("Output ZIP:")} ${chalk.yellow(zipPath)}`);
console.log();

zipFolder(folderName, zipPath);
