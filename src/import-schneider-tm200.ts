// // src/import-tm200.ts
// import { bootstrap } from '@vendure/core';
// import { populate } from '@vendure/core/cli';
// import { InitialData, LanguageCode } from '@vendure/core';
// import path from 'path';
// import fs from 'fs';
//
// import { config } from './vendure-config';
//
// // Initial data pentru setup - doar pentru TM200 (NO collections since they already exist)
// const initialData: InitialData = {
//     defaultLanguage: LanguageCode.en,
//     countries: [
//         {name: 'Romania', code: 'RO', zone: 'Europe'},
//     ],
//     defaultZone: 'Europe',
//     taxRates: [
//         {name: 'TVA Standard', percentage: 19},
//     ],
//     shippingMethods: [
//         {name: 'Standard Shipping', price: 1500}, // 15 RON în cents
//         {name: 'Express Shipping', price: 2500},  // 25 RON în cents
//     ],
//     paymentMethods: [
//         {
//             name: 'Card Payment',
//             handler: {
//                 code: 'dummy-payment-handler',
//                 arguments: [{name: 'automaticSettle', value: 'true'}],
//             },
//         },
//     ],
//     // NO collections - they already exist from TM100 import
//     collections: []
// };
//
// async function importTM200Products() {
//     console.log('🚀 Starting TM200 M200 Series PLC products import...');
//
//     // Look for TM200 CSV file only
//     const csvPath = path.join(process.cwd(), 'tm200_batch_import.csv');
//
//     console.log('🔍 Looking for TM200 CSV file...');
//
//     if (!fs.existsSync(csvPath)) {
//         console.error('❌ TM200 CSV file not found.');
//         console.error('Expected file: tm200_batch_import.csv');
//         console.error('💡 Make sure to run your Python script first to generate the TM200 CSV file.');
//         process.exit(1);
//     }
//
//     console.log(`📁 Found TM200 CSV file: ${path.basename(csvPath)}`);
//
//     try {
//         // Verify CSV has content
//         const stats = fs.statSync(csvPath);
//         console.log(`📊 File size: ${(stats.size / 1024).toFixed(2)} KB`);
//
//         if (stats.size === 0) {
//             console.error(`❌ TM200 CSV file is empty!`);
//             console.error('💡 Check your Python script output.');
//             process.exit(1);
//         }
//
//         // Preview CSV content
//         const preview = fs.readFileSync(csvPath, 'utf-8').split('\n').slice(0, 3);
//         console.log('📋 TM200 CSV preview:');
//         preview.forEach((line, index) => {
//             if (line.trim()) {
//                 console.log(`   ${index === 0 ? 'Header' : `Row ${index}`}: ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`);
//             }
//         });
//
//         await importTM200CSV(csvPath);
//
//     } catch (error) {
//         console.error(`❌ Error processing TM200 CSV:`, error);
//         process.exit(1);
//     }
//
//     console.log('\n🎉 TM200 import completed!');
//     console.log('🔧 Next steps:');
//     console.log('   1. Check Vendure Admin UI → Catalog → Products');
//     console.log('   2. Verify TM200 M200 Series PLCs are imported with correct specifications');
//     console.log('   3. Check that AutoFacetsPlugin created additional PLC facets for TM200');
//     console.log('   4. Test product filtering in PLC Collections (should include both TM100 & TM200)');
//     console.log('   5. Both TM100 and TM200 products should now be available!');
// }
//
// async function importTM200CSV(csvPath: string) {
//     console.log(`🔄 Importing TM200 M200 Series PLCs from ${path.basename(csvPath)}...`);
//
//     try {
//         const app = await populate(
//             () => bootstrap(config),
//             initialData,
//             csvPath
//         );
//
//         console.log(`✅ Successfully imported TM200 M200 Series PLCs`);
//         console.log('📝 What was imported:');
//         console.log('   - TM200 M200 Series PLC products with technical specifications');
//         console.log('   - Custom fields: category=plc, productType=TM200, brand, voltage');
//         console.log('   - PLC-specific fields: digitalInputs, digitalOutputs, analogInputs');
//         console.log('   - Communication and programming language specifications');
//         console.log('   - SKUs and pricing for TM200 M200 series');
//         console.log('   - AutoFacetsPlugin will process these automatically');
//         console.log('   - Products will be added to existing PLC collection');
//
//         await app.close();
//
//         // Wait a bit for AutoFacetsPlugin to process
//         console.log('⏳ Waiting for AutoFacetsPlugin to process TM200 products...');
//         await new Promise(resolve => setTimeout(resolve, 2000));
//
//     } catch (error) {
//         console.error(`❌ TM200 import failed:`, error);
//
//         if (error instanceof Error) {
//             console.error('Error details:', error.message);
//
//             // TM200-specific error handling
//             if (error.message.includes('custom field')) {
//                 console.error('💡 Solution: Check TM200 custom fields in CSV match vendure-config.ts');
//                 console.error('   Expected TM200 fields: category, productType, brand, voltage,');
//                 console.error('   digitalInputs, digitalOutputs, analogInputs, communication, programmingLanguage');
//             } else if (error.message.includes('price')) {
//                 console.error('💡 Solution: Check TM200 price format in CSV (should be in cents)');
//             } else if (error.message.includes('slug')) {
//                 console.error('💡 Solution: Ensure all TM200 slugs are unique and URL-friendly');
//                 console.error('   Note: TM200 slugs must be different from TM100 slugs!');
//             } else if (error.message.includes('sku')) {
//                 console.error('💡 Solution: Ensure all TM200 SKUs are unique');
//                 console.error('   Note: TM200 SKUs must be different from TM100 SKUs!');
//             } else if (error.message.includes('duplicate')) {
//                 console.error('💡 Solution: Check for duplicate products between TM100 and TM200');
//                 console.error('   Each product must have unique SKU and slug across both series');
//             }
//         }
//
//         throw error;
//     }
// }
//
// // Validation function for TM200-specific custom fields
// function validateTM200Config() {
//     console.log('🔍 Validating Vendure configuration for TM200 import...');
//
//     const productCustomFields = config.customFields?.Product;
//     if (!productCustomFields) {
//         console.warn('⚠️  No Product custom fields configured');
//         return false;
//     }
//
//     // Check for TM200-specific required fields
//     const tm200RequiredFields = [
//         'category', 'productType', 'brand', 'voltage'
//     ];
//
//     // TM200-specific optional fields (same as TM100 since both are PLCs)
//     const tm200OptionalFields = [
//         'digitalInputs', 'digitalOutputs', 'analogInputs',
//         'communication', 'programmingLanguage',
//         'commercialStatus', 'statusCode'
//     ];
//
//     const configuredFields = productCustomFields.map(field => field.name);
//     const missingRequired = tm200RequiredFields.filter(field => !configuredFields.includes(field));
//
//     if (missingRequired.length > 0) {
//         console.error('❌ Missing required custom fields for TM200:', missingRequired.join(', '));
//         console.error('💡 Add these fields to vendure-config.ts customFields.Product');
//         return false;
//     }
//
//     console.log('✅ Required TM200 custom fields are configured');
//
//     const foundOptional = tm200OptionalFields.filter(field => configuredFields.includes(field));
//     console.log(`📋 TM200 optional fields configured: ${foundOptional.length}/${tm200OptionalFields.length}`);
//
//     // Check if productType includes TM200
//     const productTypeField = productCustomFields.find(field => field.name === 'productType');
//     if (productTypeField && productTypeField.options) {
//         const hasTM200Option = productTypeField.options.some(option => option.value === 'TM200');
//         if (hasTM200Option) {
//             console.log('✅ TM200 productType option is configured');
//         } else {
//             console.warn('⚠️  TM200 option not found in productType field');
//             console.warn('💡 Make sure vendure-config.ts has TM200 in productType options');
//         }
//     }
//
//     // Check if AutoFacetsPlugin is configured
//     const hasAutoFacetsPlugin = config.plugins?.some(plugin =>
//         plugin.constructor.name === 'AutoFacetsPlugin' ||
//         plugin.toString().includes('AutoFacetsPlugin')
//     );
//
//     if (hasAutoFacetsPlugin) {
//         console.log('✅ AutoFacetsPlugin is configured');
//     } else {
//         console.warn('⚠️  AutoFacetsPlugin not found in config.plugins');
//         console.warn('💡 Make sure AutoFacetsPlugin.init() is in your plugins array');
//     }
//
//     return true;
// }
//
// // Helper function to check if server is running
// async function checkServerStatus() {
//     console.log('🔍 Checking if Vendure server is running...');
//
//     try {
//         // Try to connect to the admin API
//         const response = await fetch('http://localhost:3000/admin-api', {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ query: '{ __typename }' })
//         });
//
//         if (response.ok) {
//             console.log('⚠️  Vendure server is already running!');
//             console.log('💡 Stop the server first with Ctrl+C, then run this import script');
//             return true;
//         }
//     } catch (error) {
//         // Server is not running, which is what we want
//         console.log('✅ Server is not running - good for import');
//         return false;
//     }
//
//     return false;
// }
//
// // Helper function to check if TM100 was imported first
// function checkPrerequisites() {
//     console.log('🔍 Checking if TM100 import was completed first...');
//
//     // This is a simple check - in production you might query the database
//     console.log('💡 Make sure you have run import-tm100.ts first!');
//     console.log('   TM200 products will be added to the existing PLC collection');
//     console.log('   and will share facets with TM100 products.');
//
//     return true;
// }
//
// async function main() {
//     console.log('🎯 TM200 M200 Series PLC Import Script');
//     console.log('=====================================\n');
//
//     // Check prerequisites
//     checkPrerequisites();
//
//     // Check if server is running
//     const serverRunning = await checkServerStatus();
//     if (serverRunning) {
//         console.error('❌ Please stop the Vendure server before running TM200 import');
//         process.exit(1);
//     }
//
//     // Validate configuration for TM200
//     const isValid = validateTM200Config();
//     if (!isValid) {
//         console.error('❌ TM200 configuration validation failed');
//         console.error('💡 Fix the configuration in vendure-config.ts and try again');
//         process.exit(1);
//     }
//
//     // Start TM200 import
//     await importTM200Products();
//
//     console.log('\n🎉 TM200 import completed successfully!');
//     console.log('🚀 You can now start your Vendure server to check results: npm run dev');
//     console.log('🎯 Both TM100 and TM200 products should now be available in the PLC collection!');
//     console.log('📊 Check Admin UI → Catalog → Products to see all imported PLCs');
//     console.log('🔍 Check Admin UI → Catalog → Facets to see auto-generated facets');
// }
//
// if (require.main === module) {
//     main().catch(error => {
//         console.error('❌ Fatal error in TM200 import:', error);
//         process.exit(1);
//     });
// }