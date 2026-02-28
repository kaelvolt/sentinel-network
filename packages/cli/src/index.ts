#!/usr/bin/env node

import { Command } from 'commander';
import { configDotenv } from 'dotenv';
import { createKaelRuntime, validateEnv, logger, generateAndStoreDigest } from '@kael/core';
import { prisma, testConnection, redis } from '@kael/storage';
import { SourceKind } from '@kael/shared';

// Load environment variables
configDotenv();

const program = new Command();

program
  .name('sentinel')
  .description('Sentinel Network - Civic Intelligence CLI')
  .version('0.1.0');

/**
 * Worker command - runs KaelRuntime continuously
 */
program
  .command('worker')
  .description('Start the continuous ingestion and analysis worker')
  .option('-i, --interval <ms>', 'Run interval in milliseconds', '60000')
  .option('--no-digest', 'Skip digest generation after each run')
  .action(async (options) => {
    try {
      console.log('🚀 Starting Sentinel worker...');
      console.log(`   Interval: ${options.interval}ms`);
      console.log(`   Digest generation: ${options.digest ? 'enabled' : 'disabled'}`);
      console.log('');

      validateEnv();

      // Test database connection
      const dbHealthy = await testConnection();
      if (!dbHealthy) {
        console.error('❌ Database connection failed');
        process.exit(1);
      }

      const redisHealthy = await redis.ping() === 'PONG';
      if (!redisHealthy) {
        console.error('❌ Redis connection failed');
        process.exit(1);
      }

      console.log('✓ Database connected');
      console.log('✓ Redis connected');
      console.log('');

      // Create runtime with custom interval
      const runtime = createKaelRuntime({
        intervalMs: parseInt(options.interval, 10),
      });

      // Run immediately
      console.log('▶ Running initial cycle...\n');
      const initialResult = await runtime.runOnce();

      if (initialResult.success) {
        console.log(`✓ Initial cycle complete`);
        console.log(`  Sources: ${initialResult.metrics?.sourcesProcessed || 0}`);
        console.log(`  Items: ${initialResult.metrics?.itemsAccepted || 0}`);
        console.log(`  Signals: ${initialResult.metrics?.signalsCreated || 0}`);
        console.log('');

        // Generate initial digest if enabled
        if (options.digest) {
          try {
            const digest = await generateAndStoreDigest(24);
            console.log(`✓ Digest generated: ${digest.digestId} (${digest.signalCount} signals)`);
          } catch (e) {
            console.warn('⚠ Digest generation failed:', e);
          }
        }
      } else {
        console.error('✗ Initial cycle failed:', initialResult.error?.message);
      }

      console.log('');
      console.log('▶ Starting continuous loop (Ctrl+C to stop)...\n');

      // Start continuous loop
      await runtime.runForever();

    } catch (error) {
      console.error('Worker failed:', error);
      process.exit(1);
    }
  });

/**
 * Run-once command - single pipeline execution
 */
program
  .command('run-once')
  .description('Run a single ingestion and analysis cycle')
  .option('--no-digest', 'Skip digest generation')
  .action(async (options) => {
    try {
      console.log('▶ Running single cycle...\n');

      validateEnv();

      const dbHealthy = await testConnection();
      if (!dbHealthy) {
        console.error('❌ Database connection failed');
        process.exit(1);
      }

      const runtime = createKaelRuntime();
      const result = await runtime.runOnce();

      if (result.success) {
        console.log('✓ Cycle complete');
        console.log('');
        console.log('Metrics:');
        console.log(`  Sources processed: ${result.metrics?.sourcesProcessed || 0}`);
        console.log(`  Items fetched: ${result.metrics?.itemsFetched || 0}`);
        console.log(`  Items accepted: ${result.metrics?.itemsAccepted || 0}`);
        console.log(`  Items rejected: ${result.metrics?.itemsRejected || 0}`);
        console.log(`  Clusters created: ${result.metrics?.clustersCreated || 0}`);
        console.log(`  Signals created: ${result.metrics?.signalsCreated || 0}`);
        console.log(`  Duration: ${result.metrics?.durationMs || 0}ms`);
        console.log('');

        if (options.digest) {
          try {
            const digest = await generateAndStoreDigest(24);
            console.log(`✓ Digest generated: ${digest.digestId}`);
            console.log(`  Signals in digest: ${digest.signalCount}`);
          } catch (e) {
            console.warn('⚠ Digest generation failed:', e);
          }
        }

        process.exit(0);
      } else {
        console.error('✗ Cycle failed:', result.error?.message);
        process.exit(1);
      }
    } catch (error) {
      console.error('Run-once failed:', error);
      process.exit(1);
    }
  });

/**
 * Add-source command - add a new RSS source
 */
program
  .command('add-source')
  .description('Add a new source for ingestion')
  .requiredOption('-k, --kind <type>', 'Source kind (rss, web, github, manual)')
  .requiredOption('-n, --name <name>', 'Source name')
  .requiredOption('-u, --url <url>', 'Source URL or feed URL')
  .option('-r, --reliability <0-1>', 'Reliability hint (0.0 to 1.0)', '0.5')
  .option('-e, --enabled', 'Enable immediately', true)
  .option('--no-enabled', 'Disable initially')
  .action(async (options) => {
    try {
      console.log('📰 Adding new source...\n');

      validateEnv();

      // Validate kind
      const kind = options.kind.toLowerCase();
      if (!['rss', 'web', 'github', 'manual'].includes(kind)) {
        console.error(`❌ Invalid kind: ${kind}`);
        console.error('   Valid options: rss, web, github, manual');
        process.exit(1);
      }

      // Validate reliability
      const reliability = parseFloat(options.reliability);
      if (isNaN(reliability) || reliability < 0 || reliability > 1) {
        console.error('❌ Reliability must be between 0.0 and 1.0');
        process.exit(1);
      }

      // Check for duplicate URL
      const existing = await prisma.source.findFirst({
        where: { baseUrl: options.url },
      });

      if (existing) {
        console.error(`❌ Source with URL already exists: ${existing.name}`);
        console.error(`   ID: ${existing.id}`);
        process.exit(1);
      }

      // Create source
      const source = await prisma.source.create({
        data: {
          kind: kind as SourceKind,
          name: options.name,
          baseUrl: options.url,
          reliabilityHint: reliability,
          enabled: options.enabled,
          policy: null,
        },
      });

      console.log('✓ Source created successfully');
      console.log('');
      console.log('Details:');
      console.log(`  ID: ${source.id}`);
      console.log(`  Name: ${source.name}`);
      console.log(`  Kind: ${source.kind}`);
      console.log(`  URL: ${source.baseUrl}`);
      console.log(`  Reliability: ${source.reliabilityHint}`);
      console.log(`  Enabled: ${source.enabled}`);
      console.log('');

      if (source.enabled) {
        console.log('💡 The worker will ingest from this source on the next run.');
      } else {
        console.log('💡 Enable with: sentinel enable-source ' + source.id);
      }

      process.exit(0);
    } catch (error) {
      console.error('Failed to add source:', error);
      process.exit(1);
    }
  });

/**
 * List-sources command
 */
program
  .command('list-sources')
  .description('List all sources')
  .option('-e, --enabled-only', 'Show only enabled sources')
  .action(async (options) => {
    try {
      validateEnv();

      const where = options.enabledOnly ? { enabled: true } : {};

      const sources = await prisma.source.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          kind: true,
          baseUrl: true,
          reliabilityHint: true,
          enabled: true,
          createdAt: true,
          _count: {
            select: { rawItems: true },
          },
        },
      });

      console.log(`📰 Sources (${sources.length} total)\n`);

      for (const source of sources) {
        const status = source.enabled ? '✓' : '✗';
        console.log(`${status} ${source.name}`);
        console.log(`   ID: ${source.id.slice(0, 8)}...`);
        console.log(`   Kind: ${source.kind} | Reliability: ${source.reliabilityHint}`);
        console.log(`   URL: ${source.baseUrl}`);
        console.log(`   Items: ${source._count.rawItems}`);
        console.log('');
      }

      process.exit(0);
    } catch (error) {
      console.error('Failed to list sources:', error);
      process.exit(1);
    }
  });

/**
 * Health check command
 */
program
  .command('health')
  .description('Check system health')
  .action(async () => {
    try {
      console.log('🏥 Health Check\n');

      validateEnv();

      const dbHealthy = await testConnection();
      const redisHealthy = await redis.ping() === 'PONG';

      console.log(`Database: ${dbHealthy ? '✓ Healthy' : '✗ Unhealthy'}`);
      console.log(`Redis:    ${redisHealthy ? '✓ Healthy' : '✗ Unhealthy'}`);

      if (dbHealthy && redisHealthy) {
        console.log('\n✓ All systems operational');
        process.exit(0);
      } else {
        console.log('\n✗ Some systems are down');
        process.exit(1);
      }
    } catch (error) {
      console.error('Health check failed:', error);
      process.exit(1);
    }
  });

/**
 * Status command - quick overview
 */
program
  .command('status')
  .description('Show system status overview')
  .action(async () => {
    try {
      console.log('📊 Sentinel Status\n');

      validateEnv();

      // Source counts
      const totalSources = await prisma.source.count();
      const enabledSources = await prisma.source.count({ where: { enabled: true } });

      // Signal counts (last 24h)
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentSignals = await prisma.signal.count({
        where: { createdAt: { gte: last24h } },
      });

      // Total items
      const totalItems = await prisma.rawItem.count();

      console.log('Sources:');
      console.log(`  Total: ${totalSources} (${enabledSources} enabled)`);
      console.log('');
      console.log('Signals (24h):');
      console.log(`  Created: ${recentSignals}`);
      console.log('');
      console.log('Raw Items:');
      console.log(`  Total: ${totalItems}`);
      console.log('');

      // Latest digest
      const latestDigest = await prisma.digest.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { id: true, signalCount: true, createdAt: true },
      });

      if (latestDigest) {
        console.log('Latest Digest:');
        console.log(`  ID: ${latestDigest.id.slice(0, 8)}...`);
        console.log(`  Signals: ${latestDigest.signalCount}`);
        console.log(`  Generated: ${latestDigest.createdAt.toLocaleString()}`);
      } else {
        console.log('No digests generated yet');
      }

      process.exit(0);
    } catch (error) {
      console.error('Status check failed:', error);
      process.exit(1);
    }
  });

// Parse arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
