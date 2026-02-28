#!/usr/bin/env node

import { Command } from 'commander';
import { configDotenv } from 'dotenv';
import { validateEnv } from '@kael/core';
import { db, redis, testConnection } from '@kael/storage';

configDotenv();

const program = new Command();

program
  .name('kael')
  .description('Kael Platform CLI')
  .version('0.0.0');

program
  .command('health')
  .description('Check system health')
  .action(async () => {
    try {
      validateEnv();
      const dbHealthy = await testConnection();
      const redisHealthy = await redis.ping() === 'PONG';
      
      console.log('Health Check:');
      console.log(`  Database: ${dbHealthy ? '✓ Healthy' : '✗ Unhealthy'}`);
      console.log(`  Redis:    ${redisHealthy ? '✓ Healthy' : '✗ Unhealthy'}`);
      
      process.exit(dbHealthy && redisHealthy ? 0 : 1);
    } catch (error) {
      console.error('Health check failed:', error);
      process.exit(1);
    }
  });

program
  .command('db:seed')
  .description('Seed the database with sample data')
  .action(async () => {
    try {
      validateEnv();
      // Add seed logic here
      console.log('Database seeded successfully');
      process.exit(0);
    } catch (error) {
      console.error('Seed failed:', error);
      process.exit(1);
    }
  });

program
  .command('db:reset')
  .description('Reset the database (WARNING: Destructive)')
  .option('-f, --force', 'Force reset without confirmation')
  .action(async (options) => {
    if (!options.force) {
      console.log('Use --force to confirm database reset');
      process.exit(1);
    }
    try {
      validateEnv();
      // Add reset logic here
      console.log('Database reset successfully');
      process.exit(0);
    } catch (error) {
      console.error('Reset failed:', error);
      process.exit(1);
    }
  });

program.parse();
