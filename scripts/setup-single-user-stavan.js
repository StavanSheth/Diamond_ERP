const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require(path.resolve('apps/api/node_modules/@prisma/client'));

async function main() {
  console.log('--- Cleaning users and ensuring single user "stavan" ---');
  
  // 1. Reset .profile-config.json to only "Stavan"
  const configPath = path.resolve('apps/api/.profile-config.json');
  const cleanProfileConfig = {
    activeProfile: 'Stavan',
    allowedProfiles: ['Stavan']
  };
  fs.writeFileSync(configPath, JSON.stringify(cleanProfileConfig, null, 2), 'utf-8');
  console.log('✔ Cleaned apps/api/.profile-config.json to only "Stavan"');

  // Also clean root .profile-config.json if it exists
  const rootConfigPath = path.resolve('.profile-config.json');
  if (fs.existsSync(rootConfigPath)) {
    fs.writeFileSync(rootConfigPath, JSON.stringify(cleanProfileConfig, null, 2), 'utf-8');
  }

  // Remove test databases from apps/api so they do not get auto-discovered
  const testDbs = ['apps/api/Stuti.db', 'apps/api/prisma/Stuti.db'];
  for (const db of testDbs) {
    if (fs.existsSync(db)) {
      try {
        fs.unlinkSync(db);
        console.log(`✔ Removed test database: ${db}`);
      } catch (e) {
        console.warn(`Could not remove ${db}: ${e.message}`);
      }
    }
  }

  // 2. Open Stavan.db and clean users
  const dbPath = path.resolve('apps/api/Stavan.db');
  if (!fs.existsSync(dbPath)) {
    console.error('Stavan.db does not exist at:', dbPath);
    return;
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: `file:${dbPath}` } }
  });

  try {
    // Delete all sessions
    await prisma.session.deleteMany();
    // Delete all userProfiles
    await prisma.userProfile.deleteMany();
    // Delete all existing users
    await prisma.user.deleteMany();
    console.log('✔ Cleared all previous users and sessions');

    // Ensure Profile "Stavan" exists
    let stavanProfile = await prisma.profile.findUnique({ where: { code: 'Stavan' } });
    if (!stavanProfile) {
      stavanProfile = await prisma.profile.create({
        data: {
          code: 'Stavan',
          name: 'Stavan',
          isActive: true
        }
      });
      console.log('✔ Created Profile: Stavan');
    }

    // Delete any other profiles in DB
    await prisma.profile.deleteMany({
      where: {
        code: { not: 'Stavan' }
      }
    });
    console.log('✔ Cleaned up non-Stavan profiles');

    // Create single user "stavan"
    const passwordHash = await bcrypt.hash('Stavan@123', 10);
    const user = await prisma.user.create({
      data: {
        username: 'stavan',
        displayName: 'Stavan',
        passwordHash,
        role: 'SUPER_ADMIN',
        isActive: true,
        userProfiles: {
          create: {
            profileId: stavanProfile.id,
            role: 'SUPER_ADMIN',
            isActive: true
          }
        }
      }
    });

    console.log('✔ Successfully created single user:', {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role
    });

    const userCount = await prisma.user.count();
    const profileCount = await prisma.profile.count();
    const diamondCount = await prisma.diamondItem.count();
    const partyCount = await prisma.party.count();

    console.log('--------------------------------------------------');
    console.log('Database Summary:');
    console.log('  Total Users:    ', userCount, '(Only "stavan")');
    console.log('  Total Profiles: ', profileCount, '(Only "Stavan")');
    console.log('  Diamond Items:  ', diamondCount);
    console.log('  Parties:        ', partyCount);
    console.log('--------------------------------------------------');
  } catch (err) {
    console.error('Error setting up user:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
