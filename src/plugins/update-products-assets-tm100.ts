// src/update-products-assets-tm100.ts
import {
    bootstrap,
    LanguageCode,
    ProductService,
    RequestContextService,
    ChannelService,
    TransactionalConnection,
    AssetService,
    ID,
} from '@vendure/core';
import { CreateAssetResult } from '@vendure/common/lib/generated-types';
import { config } from '../vendure-config';
import fs from 'fs';
import csv from 'csv-parser';
import fetch from 'node-fetch';
import path from 'path';
import { Readable } from 'stream';

// Temporar director pentru imagini
const TEMP_DIR = path.join(__dirname, '../temp-assets');

// Creează un stream compatibil cu multer pentru Vendure
function createCompatibleStream(filePath: string): any {
    const fileBuffer = fs.readFileSync(filePath);
    const stream = Readable.from(fileBuffer);
    const stats = fs.statSync(filePath);

    // Simulează obiectul File din multer care Vendure se așteaptă
    const mockFile = {
        fieldname: 'file',
        originalname: path.basename(filePath),
        encoding: '7bit',
        mimetype: filePath.endsWith('.png') ? 'image/png' : 'image/jpeg',
        buffer: fileBuffer,
        size: stats.size,
        stream: stream,
        destination: '',
        filename: path.basename(filePath),
        path: filePath,
        // Adaugă metoda createReadStream care lipsește
        createReadStream: () => fs.createReadStream(filePath)
    };

    return mockFile;
}

async function downloadImage(url: string, filename: string): Promise<string | null> {
    try {
        console.log(`📥 Downloading: ${url}`);
        const response = await fetch(url, { timeout: 30000 });

        if (!response.ok) {
            console.warn(`⚠️ Failed to download ${url}: ${response.status}`);
            return null;
        }

        const buffer = await response.buffer();

        if (!fs.existsSync(TEMP_DIR)) {
            fs.mkdirSync(TEMP_DIR, { recursive: true });
        }

        const filePath = path.join(TEMP_DIR, filename);
        fs.writeFileSync(filePath, buffer);

        console.log(`✅ Downloaded: ${filename}`);
        return filePath;
    } catch (error) {
        // @ts-ignore
        console.error(`❌ Download error for ${url}:`, error.message);
        return null;
    }
}

async function createAssetFromFile(assetService: AssetService, ctx: any, filePath: string): Promise<ID | null> {
    try {
        // Verifică că fișierul există înainte de a crea stream-ul
        if (!fs.existsSync(filePath)) {
            console.error(`❌ File not found: ${filePath}`);
            return null;
        }

        // Creează un mock file object compatibil cu multer
        const mockFile = createCompatibleStream(filePath);

        const result: CreateAssetResult = await assetService.create(ctx, {
            file: mockFile,
            tags: ['tm100', 'auto-imported'],
        });

        if ('id' in result) {
            console.log(`✅ Asset created: ${result.id}`);
            return result.id;
        } else {
            console.warn(`⚠️ Asset creation failed: ${result.__typename}`);
            return null;
        }
    } catch (error) {
        // @ts-ignore
        console.error(`❌ Asset creation error:`, error.message);
        return null;
    }
}

async function updateProductsWithAssets() {
    console.log('🚀 Starting assets update...');

    const csvPath = 'src/DataCSV/tm100_batch_import.csv';
    if (!fs.existsSync(csvPath)) {
        console.error(`❌ CSV file not found: ${csvPath}`);
        process.exit(1);
    }

    const app = await bootstrap(config);
    const connection = app.get(TransactionalConnection);
    const ctxService = app.get(RequestContextService);
    const channelService = app.get(ChannelService);
    const productService = app.get(ProductService);
    const assetService = app.get(AssetService);

    const defaultChannel = await channelService.getDefaultChannel();
    const ctx = await ctxService.create({
        apiType: 'admin',
        channelOrToken: defaultChannel.token,
        languageCode: LanguageCode.en,
    });

    const rows: any[] = [];

    return new Promise<void>((resolve, reject) => {
        fs.createReadStream(csvPath)
            .pipe(csv({ separator: ',' }))
            .on('data', (row) => {
                if (!row.sku || !row.assets) return;
                rows.push(row);
            })
            .on('end', async () => {
                console.log(`📦 Found ${rows.length} products with assets to process`);

                let updatedCount = 0;
                let skippedCount = 0;
                let errorCount = 0;

                for (const [index, row] of rows.entries()) {
                    console.log(`\n🔄 Processing ${index + 1}/${rows.length}: ${row.sku}`);

                    try {
                        // 1. Find product by SKU
                        const variant = await connection.rawConnection
                            .getRepository('product_variant')
                            .createQueryBuilder('variant')
                            .leftJoinAndSelect('variant.product', 'product')
                            .where('variant.sku = :sku', { sku: row.sku })
                            .andWhere('variant.deletedAt IS NULL')
                            .getOne();

                        if (!variant) {
                            console.warn(`⚠️ Product not found for SKU: ${row.sku}`);
                            skippedCount++;
                            continue;
                        }

                        const productId = variant.product.id;
                        console.log(`🔍 Found product ID: ${productId}`);

                        // 2. Check if product already has assets
                        const existingProduct = await productService.findOne(ctx, productId);
                        if (existingProduct?.featuredAsset) {
                            console.log(`⚠️ Product ${row.sku} already has assets, skipping`);
                            skippedCount++;
                            continue;
                        }

                        // 3. Process assets
                        const assetUrls = row.assets.split('|').map((url: string) => url.trim()).filter(Boolean);
                        const assetIds: ID[] = [];
                        const tempFiles: string[] = []; // Track temp files pentru cleanup

                        for (const [assetIndex, url] of assetUrls.entries()) {
                            console.log(`📸 Processing asset ${assetIndex + 1}/${assetUrls.length}`);

                            // Generate filename
                            const extension = url.includes('.jpg') ? '.jpg' :
                                url.includes('.png') ? '.png' : '.jpg';
                            const filename = `${row.sku}_${assetIndex}_${Date.now()}${extension}`;

                            // Download image
                            const filePath = await downloadImage(url, filename);
                            if (!filePath) {
                                console.warn(`⚠️ Failed to download asset ${assetIndex + 1}`);
                                continue;
                            }

                            tempFiles.push(filePath); // Track pentru cleanup

                            // Create asset
                            const assetId = await createAssetFromFile(assetService, ctx, filePath);
                            if (assetId) {
                                assetIds.push(assetId);
                                console.log(`✅ Asset ${assetIndex + 1} created successfully`);
                            } else {
                                console.warn(`⚠️ Failed to create asset ${assetIndex + 1}`);
                            }
                        }

                        // 4. Update product with assets
                        if (assetIds.length > 0) {
                            console.log(`🔨 Updating product with ${assetIds.length} asset(s)`);

                            await productService.update(ctx, {
                                id: productId,
                                featuredAssetId: assetIds[0], // First asset as featured
                                assetIds: assetIds, // All assets
                            });

                            console.log(`✅ Updated product ${row.sku} with assets: ${assetIds.join(', ')}`);
                            updatedCount++;
                        } else {
                            console.warn(`⚠️ No assets created for ${row.sku}`);
                            errorCount++;
                        }

                        // 5. Cleanup temp files DUPĂ ce assets-urile au fost create
                        for (const tempFile of tempFiles) {
                            try {
                                if (fs.existsSync(tempFile)) {
                                    fs.unlinkSync(tempFile);
                                    console.log(`🗑️ Cleaned temp file: ${path.basename(tempFile)}`);
                                }
                            } catch (cleanupError) {
                                // @ts-ignore
                                console.warn(`⚠️ Cleanup warning: ${cleanupError.message}`);
                            }
                        }

                    } catch (error: any) {
                        console.error(`❌ Error processing ${row.sku}:`, error.message);
                        errorCount++;
                    }
                }

                // Cleanup temp directory
                try {
                    if (fs.existsSync(TEMP_DIR)) {
                        const files = fs.readdirSync(TEMP_DIR);
                        for (const file of files) {
                            fs.unlinkSync(path.join(TEMP_DIR, file));
                        }
                        fs.rmdirSync(TEMP_DIR);
                        console.log('🧹 Temp directory cleaned');
                    }
                } catch {} // Silent fail

                console.log(`\n📊 Assets Update Summary:`);
                console.log(`   ✅ Updated: ${updatedCount}`);
                console.log(`   ⚠️ Skipped: ${skippedCount}`);
                console.log(`   ❌ Errors: ${errorCount}`);
                console.log(`   📦 Total processed: ${rows.length}`);

                console.log('🎉 Assets update complete!');

                setTimeout(async () => {
                    await app.close();
                    resolve();
                }, 2000);
            })
            .on('error', reject);
    });
}

updateProductsWithAssets().catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});