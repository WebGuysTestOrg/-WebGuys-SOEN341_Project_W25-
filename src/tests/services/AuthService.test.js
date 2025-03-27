const AuthService = require('../../services/authService');
const connection = require('../../database/connection');

// Mock the database connection
jest.mock('../../database/connection', () => ({
    query: jest.fn()
}));

describe('AuthService', () => {
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
    });

    describe('login', () => {
        const mockUser = {
            id: 1,
            name: 'Test User',
            email: 'test@example.com',
            password: 'hashedPassword',
            user_type: 'user'
        };

        it('should return error if email or password is missing', async () => {
            const result = await AuthService.login('', 'password');
            expect(result.success).toBe(false);
            expect(result.error).toBe('Email and password are required.');
            expect(result.statusCode).toBe(400);
        });

        it('should return error if user not found', async () => {
            connection.query.mockImplementation((query, params, callback) => {
                callback(null, []);
            });

            const result = await AuthService.login('test@example.com', 'password');
            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid email or password.');
            expect(result.statusCode).toBe(401);
        });

        it('should return error on database error', async () => {
            connection.query.mockImplementation((query, params, callback) => {
                callback(new Error('Database error'), null);
            });

            const result = await AuthService.login('test@example.com', 'password');
            expect(result.success).toBe(false);
            expect(result.error).toBe('Server error. Please try again later.');
            expect(result.statusCode).toBe(500);
        });

        it('should successfully login user', async () => {
            connection.query
                .mockImplementationOnce((query, params, callback) => {
                    callback(null, [mockUser]);
                })
                .mockImplementationOnce((query, params, callback) => {
                    callback(null, null);
                });

            const result = await AuthService.login('test@example.com', 'password');
            expect(result.success).toBe(true);
            expect(result.user).toEqual({
                id: mockUser.id,
                name: mockUser.name,
                email: mockUser.email,
                user_type: mockUser.user_type
            });
            expect(result.statusCode).toBe(200);
        });
    });

    describe('logout', () => {
        it('should return error if userId is missing', async () => {
            const result = await AuthService.logout();
            expect(result.success).toBe(false);
            expect(result.error).toBe('User ID is required.');
            expect(result.statusCode).toBe(400);
        });

        it('should successfully logout user', async () => {
            connection.query.mockImplementation((query, params, callback) => {
                callback(null, null);
            });

            const result = await AuthService.logout(1);
            expect(result.success).toBe(true);
            expect(result.message).toBe('Logged out successfully');
            expect(result.statusCode).toBe(200);
        });

        it('should handle database error during logout', async () => {
            connection.query.mockImplementation((query, params, callback) => {
                callback(new Error('Database error'), null);
            });

            const result = await AuthService.logout(1);
            expect(result.success).toBe(false);
            expect(result.error).toBe('Error logging out.');
            expect(result.statusCode).toBe(500);
        });
    });

    describe('validateSession', () => {
        it('should return error if no session or user', async () => {
            const result = await AuthService.validateSession({});
            expect(result.success).toBe(false);
            expect(result.error).toBe('No active session found.');
            expect(result.statusCode).toBe(401);
        });

        it('should successfully validate session', async () => {
            const mockSession = {
                user: {
                    id: 1,
                    name: 'Test User',
                    email: 'test@example.com',
                    user_type: 'user'
                }
            };

            const result = await AuthService.validateSession(mockSession);
            expect(result.success).toBe(true);
            expect(result.user).toEqual(mockSession.user);
            expect(result.statusCode).toBe(200);
        });
    });
}); 