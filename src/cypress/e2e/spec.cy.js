describe("User Registration & Login Flow", () => {
  const user = {
    name: `TestUser${Date.now()}`,
    email: `test${Date.now()}@example.com`, // Generate a unique email
    password: "password123",
    confirmPassword: "password123",
    userType: "user",
  };

  beforeEach(() => {
    cy.visit("http://localhost:3000/register_form.html"); // Adjust if needed
  });

  it("should load the registration page", () => {
    cy.get("input#name").should("exist");
    cy.get("input#email").should("exist");
    cy.get("input#password").should("exist");
    cy.get("input#cpassword").should("exist");
    cy.get("select#user_type").should("exist");
    cy.get("button[type='submit']").should("exist");
  });

  it("should show errors when required fields are missing", () => {
    cy.get("button[type='submit']").click();

    cy.get("input#name").then(($input) => {
      expect($input[0].checkValidity()).to.be.false;
    });

    cy.get("input#email").then(($input) => {
      expect($input[0].checkValidity()).to.be.false;
    });

    cy.get("input#password").then(($input) => {
      expect($input[0].checkValidity()).to.be.false;
    });

    cy.get("input#cpassword").then(($input) => {
      expect($input[0].checkValidity()).to.be.false;
    });
  });

  it("should show an error for an invalid email format", () => {
    cy.get("input#name").type(user.name);
    cy.get("input#email").type("invalid-email");
    cy.get("input#password").type(user.password);
    cy.get("input#cpassword").type(user.confirmPassword);
    cy.get("button[type='submit']").click();
  
    // Wait for the error message text to update
    cy.get("#error-message")
      .should("have.text", "Invalid email format")
      .and("not.have.css", "display", "none"); // Ensure it's actually shown
  });
  
  it("should show an error when passwords do not match", () => {
    cy.get("input#name").type(user.name);
    cy.get("input#email").type(user.email);
    cy.get("input#password").type(user.password);
    cy.get("input#cpassword").type("wrongpassword");
    cy.get("button[type='submit']").click();

    cy.get("#error-message")
      .should("be.visible")
      .should("contain", "Passwords do not match");
  });

  it("should create an account successfully", () => {
    cy.get("input#name").type(user.name);
    cy.get("input#email").type(user.email);
    cy.get("input#password").type(user.password);
    cy.get("input#cpassword").type(user.confirmPassword);
    cy.get("select#user_type").select(user.userType);
    cy.get("button[type='submit']").click();

    cy.get("#toast-container").should("contain", "Account has been created!");
  });

  it("should navigate to the login page after registration", () => {
    cy.get("p").contains("Login here").click();
    cy.url().should("include", "login_form.html");
  });

  it("should login with the created account", () => {
    cy.visit("http://localhost:3000/login_form.html"); // Go to login page
    cy.get("input#email").type(user.email);
    cy.get("input#password").type(user.password);
    cy.get("button[type='submit']").click();

    cy.url().should("include", "/dashboard"); // Adjust based on actual redirect
  });
});

describe("Login Page", () => {
  beforeEach(() => {
    cy.visit("http://localhost:3000/login_form.html"); // Adjust path if needed
  });

  it("should load the login page", () => {
    cy.get("input[type='email']").should("exist");
    cy.get("input[type='password']").should("exist");
    cy.get("button[type='submit']").should("exist");
  });

  it("should show a required field error if email is missing", () => {
    cy.get("input[type='password']").type("password123");
    cy.get("button[type='submit']").click();
  
    // Validate that the email field is still invalid after clicking submit
    cy.get("input[type='email']").then(($input) => {
      expect($input[0].checkValidity()).to.be.false;
    });
  });

  it("should show a required field error if password is missing", () => {
    cy.get("input[type='email']").type("test@example.com");
    cy.get("button[type='submit']").click();
  
    // Validate that the password field is still invalid after clicking submit
    cy.get("input[type='password']").then(($input) => {
      expect($input[0].checkValidity()).to.be.false;
    });
  });


});
