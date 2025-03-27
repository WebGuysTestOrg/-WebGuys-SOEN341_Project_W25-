const crypto = require('crypto');
const connection = require('../database/connection');

class AuthService {
    static async login(email, password) {
        try {
            console.log('AuthService.login called with email:', email);
            
            if (!email || !password) {
                console.log('Login failed: Missing email or password');
                return {
                    success: false,
                    error: "Email and password are required.",
                    statusCode: 400
                };
            }

            const hashedPassword = crypto.createHash("md5").update(password).digest("hex");
            const query = "SELECT * FROM user_form WHERE email = ? AND password = ?";
            console.log('Executing login query for email:', email);

            return new Promise((resolve, reject) => {
                connection.query(query, [email, hashedPassword], async (err, results) => {
                    if (err) {
                        console.error("Login database error:", err);
                        return resolve({
                            success: false,
                            error: "Server error. Please try again later.",
                            statusCode: 500
                        });
                    }

                    if (results.length === 0) {
                        console.log('Login failed: Invalid credentials');
                        return resolve({
                            success: false,
                            error: "Invalid email or password.",
                            statusCode: 401
                        });
                    }

                    const user = results[0];
                    console.log('User found:', { id: user.id, name: user.name, email: user.email });
                    
                    // Log login time
                    try {
                        const logQuery = "INSERT INTO user_activity_log (user_id, name) VALUES (?, ?)";
                        await new Promise((resolveLog, rejectLog) => {
                            connection.query(logQuery, [user.id, user.name], (logErr) => {
                                if (logErr) {
                                    console.error("Error logging login:", logErr);
                                    resolveLog();
                                } else {
                                    console.log('Login activity logged successfully');
                                    resolveLog();
                                }
                            });
                        });
                    } catch (logError) {
                        console.error("Error in login logging:", logError);
                    }

                    const loginResult = {
                        success: true,
                        user: {
                            id: user.id,
                            name: user.name,
                            email: user.email,
                            user_type: user.user_type
                        },
                        statusCode: 200
                    };
                    console.log('Login successful:', loginResult);
                    return resolve(loginResult);
                });
            });
        } catch (error) {
            console.error("Login service error:", error);
            return {
                success: false,
                error: "An unexpected error occurred.",
                statusCode: 500
            };
        }
    }

    static async logout(userId) {
        try {
            if (!userId) {
                return {
                    success: false,
                    error: "User ID is required.",
                    statusCode: 400
                };
            }

            return new Promise((resolve, reject) => {
                const updateLogoutQuery = `
                    UPDATE user_activity_log 
                    SET logout_time = CURRENT_TIMESTAMP 
                    WHERE user_id = ? 
                    ORDER BY login_time DESC 
                    LIMIT 1
                `;

                connection.query(updateLogoutQuery, [userId], (err) => {
                    if (err) {
                        console.error("Error logging logout:", err);
                        return resolve({
                            success: false,
                            error: "Error logging out.",
                            statusCode: 500
                        });
                    }

                    return resolve({
                        success: true,
                        message: "Logged out successfully",
                        statusCode: 200
                    });
                });
            });
        } catch (error) {
            console.error("Logout service error:", error);
            return {
                success: false,
                error: "An unexpected error occurred.",
                statusCode: 500
            };
        }
    }

    static async validateSession(session) {
        if (!session || !session.user) {
            return {
                success: false,
                error: "No active session found.",
                statusCode: 401
            };
        }

        return {
            success: true,
            user: session.user,
            statusCode: 200
        };
    }
}

module.exports = AuthService; 