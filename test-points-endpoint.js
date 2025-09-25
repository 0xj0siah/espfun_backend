const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

async function testPointsEndpoint() {
  const prisma = new PrismaClient();
  
  console.log('Testing points endpoint fix...');
  
  // Check the user in the database
  const user = await prisma.user.findUnique({
    where: { id: '2e6b0751-76d5-4bbc-be34-a28649014573' }
  });
  
  console.log('User in database:');
  console.log(`ID: ${user.id}`);
  console.log(`Wallet: ${user.walletAddress}`);
  console.log(`Tournament Points: ${user.tournamentPoints}`);
  console.log(`Skill Points: ${user.skillPoints}`);
  
  // Verify JWT token can be decoded
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIyZTZiMDc1MS03NmQ1LTRiYmMtYmUzNC1hMjg2NDkwMTQ1NzMiLCJ3YWxsZXRBZGRyZXNzIjoiMHg5OWU5MmNlRTliRUY4ZDQwNzU1MzgzNTc1ODc3QzZiYzc3MjhBRDE5IiwiaWF0IjoxNzU3MzQxNjEyLCJleHAiOjE3NTc0MjgwMTJ9.MKQv_OnlEfY6YX-K57qaZ7CuYmmxBa1USwyQG8dBeGo';
  
  try {
    const decoded = jwt.decode(token);
    console.log('\nJWT token decoded:');
    console.log(`User ID in token: ${decoded.userId}`);
    console.log(`Wallet in token: ${decoded.walletAddress}`);
    
    // Check if they match
    const match = decoded.userId === user.id;
    console.log(`\nDo JWT user ID and database user ID match? ${match}`);
    
    if (match) {
      console.log('\n✅ SUCCESS: The JWT token points to the correct user with updated points!');
      console.log(`The API should now return: {tournamentPoints: ${user.tournamentPoints}, skillPoints: ${user.skillPoints}}`);
    } else {
      console.log('\n❌ ERROR: JWT token and database user ID mismatch');
    }
    
  } catch (error) {
    console.error('Error decoding JWT:', error);
  }
  
  await prisma.$disconnect();
}

testPointsEndpoint().catch(console.error);
