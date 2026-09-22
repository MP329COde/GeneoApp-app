export function createAccountController(services) {
  const { accounts } = services;

  return {
    create(request, response) {
      const account = accounts.create(request.body, { performedBy: request.performedBy });
      response.status(201).json(account);
    },

    list(request, response) {
      response.json(accounts.list());
    },

    remove(request, response) {
      accounts.remove(Number(request.params.id), { performedBy: request.performedBy });
      response.status(204).end();
    },

    login(request, response) {
      const { token, account } = accounts.login(request.body);
      response.json({ token, account });
    },

    logout(request, response) {
      accounts.logout(request.get('x-geneoapp-session'));
      response.status(204).end();
    },
  };
}
