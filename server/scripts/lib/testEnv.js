// Where `npm test` runs its throwaway copy of the app: a test database, a test
// Redis database and a test port, derived from the dev settings in .env so a
// test run never touches dev data.

export const TEST_DB_NAME = 'employee_management_test';
export const TEST_REDIS_DB = 15;
export const TEST_PORT = 5055;

// mongodb:// or mongodb+srv://, then credentials and one or more hosts, an
// optional /database and optional ?options. Not parsed with URL because
// several comma-separated hosts aren't a valid URL host
const MONGO_URI = /^(mongodb(?:\+srv)?:\/\/[^/?]+)(?:\/([^?]*))?(\?.*)?$/;

const parseMongoUri = (uri) => {
    const match = MONGO_URI.exec(uri || '');
    // The URI may hold a password, so it isn't repeated in the message
    if (!match) throw new Error('MONGODB_URI is not a MongoDB connection string');
    return { prefix: match[1], database: match[2] || '', options: match[3] || '' };
};

// The same connection with only the database name replaced
export const testMongoUri = (baseUri, name = TEST_DB_NAME) => {
    const { prefix, options } = parseMongoUri(baseUri);
    return `${prefix}/${name}${options}`;
};

export const databaseName = (uri) => decodeURIComponent(parseMongoUri(uri).database);

// Seeding deletes everything in the database it's given, so only databases
// whose name says they're for tests may be used
export const isTestDatabaseName = (name) => /_test$/.test(name);

// The same Redis server and credentials, on another logical database
export const testRedisUrl = (baseUrl, db = TEST_REDIS_DB) => {
    const url = new URL(baseUrl);
    url.pathname = `/${db}`;
    return url.toString();
};
