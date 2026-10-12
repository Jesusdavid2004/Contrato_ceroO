export interface UserProps {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt?: Date;
}

export class User {
  public readonly id: string;
  public readonly name: string;
  public readonly email: string;
  public readonly passwordHash: string;
  public readonly createdAt: Date;

  constructor(props: UserProps) {
    this.id = props.id;
    this.name = props.name;
    this.email = props.email.toLowerCase().trim();
    this.passwordHash = props.passwordHash;
    this.createdAt = props.createdAt || new Date();
  }

  public toJSON() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      createdAt: this.createdAt.toISOString(),
    };
  }
}
