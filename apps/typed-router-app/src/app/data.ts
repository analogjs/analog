export interface User {
  id: string;
  name: string;
  posts: number[];
}

export interface Member {
  id: string;
  name: string;
}

export interface Team {
  id: string;
  name: string;
  members: Member[];
}

export interface Org {
  id: string;
  name: string;
  teams: Team[];
}

export const USERS: User[] = [
  { id: '1', name: 'Ada', posts: [1, 2] },
  { id: '2', name: 'Grace', posts: [3] },
  { id: '3', name: 'Alan', posts: [] },
];

export const ORGS: Org[] = [
  {
    id: 'analogjs',
    name: 'AnalogJS',
    teams: [
      {
        id: 'core',
        name: 'Core',
        members: [
          { id: '1', name: 'Morgan' },
          { id: '2', name: 'Riley' },
        ],
      },
      { id: 'docs', name: 'Docs', members: [{ id: '3', name: 'Sam' }] },
    ],
  },
];

export const findUser = (id: string | null) =>
  USERS.find((user) => user.id === id);

export const findOrg = (id: string | null) => ORGS.find((org) => org.id === id);

export const findTeam = (orgId: string | null, teamId: string | null) =>
  findOrg(orgId)?.teams.find((team) => team.id === teamId);
