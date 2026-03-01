module.exports = {
    transform: {
        '^.+\.js$': 'babel-jest',
        '^.+\.ts$': 'ts-jest',
    },
    testEnvironment: 'node',
    moduleFileExtensions: ['js', 'json', 'jsx', 'ts', 'tsx', 'node'],
};