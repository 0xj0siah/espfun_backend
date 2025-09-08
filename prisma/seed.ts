import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create initial player packs
  const packs = await Promise.all([
    prisma.playerPack.create({
      data: {
        name: 'Starter Pack',
        description: 'Basic player pack for newcomers',
        cost: 50,
        pointType: 'TOURNAMENT',
        rarity: 'common'
      }
    }),
    prisma.playerPack.create({
      data: {
        name: 'Pro Pack',
        description: 'Advanced player pack with better odds',
        cost: 100,
        pointType: 'TOURNAMENT',
        rarity: 'rare'
      }
    }),
    prisma.playerPack.create({
      data: {
        name: 'Elite Pack',
        description: 'Premium player pack with guaranteed rare players',
        cost: 75,
        pointType: 'SKILL',
        rarity: 'epic'
      }
    }),
    prisma.playerPack.create({
      data: {
        name: 'Legendary Pack',
        description: 'Ultra-rare pack with legendary player guarantees',
        cost: 150,
        pointType: 'SKILL',
        rarity: 'legendary'
      }
    })
  ]);

  console.log(`Created ${packs.length} player packs`);

  // Create a sample game event
  const event = await prisma.gameEvent.create({
    data: {
      name: 'Season 1 Championship',
      description: 'The inaugural championship tournament',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      tournamentReward: 500,
      skillReward: 250
    }
  });

  console.log('Created sample game event');

  console.log('Database seeded successfully');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
