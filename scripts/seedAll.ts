import { execSync } from "child_process";

const runSeedScripts = () => {
  console.log("Starting full database seed sequence...\n");

  try {
    console.log("================================");
    console.log("       Seeding Admin User       ");
    console.log("================================");
    execSync("npx ts-node scripts/seedAdmin.ts", { stdio: "inherit" });

    console.log("\n================================");
    console.log("  Seeding Products & Variants   ");
    console.log("================================");
    execSync("npx ts-node scripts/seedProducts.ts", { stdio: "inherit" });

    console.log("\n================================");
    console.log("     Seeding Site Settings      ");
    console.log("================================");
    execSync("npx ts-node scripts/seedSiteSettings.ts", { stdio: "inherit" });

    console.log("\n✅ All seed scripts completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Database seeding process failed.");
    process.exit(1);
  }
};

runSeedScripts();
