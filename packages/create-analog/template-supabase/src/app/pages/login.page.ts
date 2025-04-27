import { FormAction } from "@analogjs/router";
import { Component } from "@angular/core";

@Component({
  selector: 'app-login-page',
  imports: [FormAction],
  template: `
    <h2>Login</h2>  
  
    <form method="post">
      <label for="email">Email:</label>
      <input id="email" name="email" type="email" autocomplete="off" />

      <br />

      <label for="password">Password:</label>
      <input id="password" name="password" type="password"/>

      <br />

      <button type="submit">Log in</button>
      <br />
    </form>
  `,
  styles: `
    form { 
      display: flex;
      padding: 4px;
      flex-direction: column;
    }
  `
})
export default class LoginPage {}