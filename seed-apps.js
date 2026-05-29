require('dotenv').config();
const knex = require('knex');

const apps = [
  { name: 'Google Chrome', category: 'Browsers', winget_id: 'Google.Chrome' },
  { name: 'Mozilla Firefox', category: 'Browsers', winget_id: 'Mozilla.Firefox' },
  { name: 'Microsoft Edge', category: 'Browsers', winget_id: 'Microsoft.Edge' },
  { name: 'Opera', category: 'Browsers', winget_id: 'Opera.Opera' },
  { name: 'Brave', category: 'Browsers', winget_id: 'Brave.Brave' },
  { name: 'Vivaldi', category: 'Browsers', winget_id: 'VivaldiTechnologies.Vivaldi' },
  { name: 'Zoom', category: 'Messaging', winget_id: 'Zoom.Zoom' },
  { name: 'Discord', category: 'Messaging', winget_id: 'Discord.Discord' },
  { name: 'Microsoft Teams', category: 'Messaging', winget_id: 'Microsoft.Teams' },
  { name: 'Slack', category: 'Messaging', winget_id: 'SlackTechnologies.Slack' },
  { name: 'Thunderbird', category: 'Messaging', winget_id: 'Mozilla.Thunderbird' },
  { name: 'VLC', category: 'Media', winget_id: 'VideoLAN.VLC' },
  { name: 'Spotify', category: 'Media', winget_id: 'Spotify.Spotify' },
  { name: 'Audacity', category: 'Media', winget_id: 'Audacity.Audacity' },
  { name: 'HandBrake', category: 'Media', winget_id: 'HandBrake.HandBrake' },
  { name: 'Malwarebytes', category: 'Security', winget_id: 'Malwarebytes.Malwarebytes' },
  { name: 'KeePass 2', category: 'Security', winget_id: 'DominikReichl.KeePass' },
  { name: 'Dropbox', category: 'Online Storage', winget_id: 'Dropbox.Dropbox' },
  { name: 'Google Drive', category: 'Online Storage', winget_id: 'Google.GoogleDrive' },
  { name: 'OneDrive', category: 'Online Storage', winget_id: 'Microsoft.OneDrive' },
  { name: 'LibreOffice', category: 'Documents', winget_id: 'TheDocumentFoundation.LibreOffice' },
  { name: 'Adobe Acrobat Reader', category: 'Documents', winget_id: 'Adobe.Acrobat.Reader.64-bit' },
  { name: 'SumatraPDF', category: 'Documents', winget_id: 'SumatraPDF.SumatraPDF' },
  { name: 'GIMP', category: 'Imaging', winget_id: 'GIMP.GIMP' },
  { name: 'Paint.NET', category: 'Imaging', winget_id: 'dotPDN.PaintDotNet' },
  { name: 'Greenshot', category: 'Imaging', winget_id: 'Greenshot.Greenshot' },
  { name: 'ShareX', category: 'Imaging', winget_id: 'ShareX.ShareX' },
  { name: 'Blender', category: 'Imaging', winget_id: 'BlenderFoundation.Blender' },
  { name: 'Visual Studio Code', category: 'Dev Tools', winget_id: 'Microsoft.VisualStudioCode' },
  { name: 'Git', category: 'Dev Tools', winget_id: 'Git.Git' },
  { name: 'Notepad++', category: 'Dev Tools', winget_id: 'Notepad++.Notepad++' },
  { name: 'Python 3', category: 'Dev Tools', winget_id: 'Python.Python.3' },
  { name: 'PuTTY', category: 'Dev Tools', winget_id: 'PuTTY.PuTTY' },
  { name: 'WinSCP', category: 'Dev Tools', winget_id: 'WinSCP.WinSCP' },
  { name: 'FileZilla', category: 'Dev Tools', winget_id: 'TimKosse.FileZilla.Client' },
  { name: '7-Zip', category: 'Compression', winget_id: '7zip.7zip' },
  { name: 'WinRAR', category: 'Compression', winget_id: 'RARLab.WinRAR' },
  { name: 'TeamViewer', category: 'Utilities', winget_id: 'TeamViewer.TeamViewer' },
  { name: 'AnyDesk', category: 'Utilities', winget_id: 'AnyDeskSoftwareGmbH.AnyDesk' },
  { name: 'CCleaner', category: 'Utilities', winget_id: 'Piriform.CCleaner' },
  { name: 'Everything', category: 'Utilities', winget_id: 'voidtools.Everything' },
  { name: 'qBittorrent', category: 'Utilities', winget_id: 'qBittorrent.qBittorrent' },
];

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing. Add it to your .env file.');
  process.exit(1);
}

const db = knex({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  },
});

async function run() {
  try {
    const orgs = await db('orgs').select('id');
    if (!orgs.length) {
      console.log('No orgs found. Nothing seeded.');
      return;
    }

    const now = new Date();
    let totalInsertedOrUpdated = 0;

    for (let i = 0; i < orgs.length; i += 1) {
      const org = orgs[i];
      const rows = apps.map((app) => ({
        org_id: org.id,
        name: app.name,
        publisher: null,
        category: app.category,
        winget_id: app.winget_id,
        icon_url: null,
        is_featured: true,
        created_at: now,
        updated_at: now,
      }));

      const result = await db('sm_apps')
        .insert(rows)
        .onConflict(['org_id', 'winget_id'])
        .merge({
          name: db.raw('EXCLUDED.name'),
          category: db.raw('EXCLUDED.category'),
          updated_at: db.raw('EXCLUDED.updated_at'),
        });

      totalInsertedOrUpdated += Array.isArray(result) ? result.length : rows.length;
    }

    console.log(`Seed complete. ${apps.length} apps processed for ${orgs.length} org(s).`);
    console.log(`Rows inserted/updated: ${totalInsertedOrUpdated}`);
  } catch (err) {
    console.error('Failed to seed sm_apps:', err.message);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

run();
